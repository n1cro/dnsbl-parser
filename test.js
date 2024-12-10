const dns = require("dns").promises;

/**
 * Выполняет запрос DNSBL с повторными попытками и экспоненциальной задержкой.
 *
 * @param {string} ip - Проверяемый IP-адрес (например, '1.2.3.4').
 * @param {string} dnsbl - Имя DNSBL-сервера (например, 'zen.spamhaus.org').
 * @param {number} attempt - Текущая попытка (по умолчанию 1).
 * @param {number} maxRetries - Максимальное число попыток (по умолчанию 5).
 * @param {number} baseDelay - Начальная задержка между попытками в мс (по умолчанию 100).
 * @param {number} factor - Множитель экспоненты для задержки (по умолчанию 2).
 * @returns {Promise<string[]|null>} - Возвращает массив адресов, если IP в списке, или null.
 */
async function queryDNSBLWithRetries(
  ip,
  dnsbl,
  attempt = 1,
  maxRetries = 5,
  baseDelay = 100,
  factor = 2
) {
  const reversedIp = ip.split(".").reverse().join(".");
  const query = `${reversedIp}.${dnsbl}`;

  try {
    // Предполагаем, что DNSBL вернёт запись, если IP в "чёрном списке".
    const addresses = await dns.resolve4(query);
    return addresses;
  } catch (err) {
    // Некоторые DNSBL в случае "не нахождения" могут возвращать NXDOMAIN,
    // что тоже нужно обрабатывать. Если код ошибки - это временный сбой (например, SERVFAIL),
    // или сетевые проблемы, то имеет смысл делать повторные попытки.

    // Список кодов для повторных попыток можно расширять:
    const retryableErrors = [
      "ECONNREFUSED",
      "SERVFAIL",
      "ETIMEOUT",
      "EAI_AGAIN",
    ];

    if (attempt < maxRetries && retryableErrors.includes(err.code)) {
      const delay = baseDelay * Math.pow(factor, attempt - 1);
      console.warn(
        `Попытка ${attempt} для ${query} завершилась ошибкой "${err.code}". Повтор через ${delay}мс...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return queryDNSBLWithRetries(
        ip,
        dnsbl,
        attempt + 1,
        maxRetries,
        baseDelay,
        factor
      );
    } else {
      // Если это не повторяемая ошибка или мы исчерпали количество попыток — выбрасываем.
      console.error(
        `Все ${maxRetries} попыток не удались для ${query}: ${
          err.code || err.message
        }`
      );
      throw err;
    }
  }
}

// Пример использования
(async () => {
  const ip = "1.2.3.4"; // IP для проверки
  const dnsblList = [
    "zen.spamhaus.org",
    "bl.spamcop.net",
    "b.barracudacentral.org",
    // ... ваши другие DNSBL-сервера
  ];

  for (const dnsbl of dnsblList) {
    try {
      const result = await queryDNSBLWithRetries(ip, dnsbl);
      if (result) {
        console.log(`${ip} включен в черный список ${dnsbl}:`, result);
      } else {
        console.log(`${ip} не найден в ${dnsbl}`);
      }
    } catch (e) {
      console.error(`Ошибка при проверке ${ip} на ${dnsbl}:`, e);
    }
  }
})();
