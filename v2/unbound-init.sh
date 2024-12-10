#!/bin/bash

if [ -z "$RESOLVERS" ]; then
  echo "Error: Env variable RESOLVERS doesn't exists."
  exit 1
fi

INTERFACE=${INTERFACE:-"ens19"}
CONFIG_DIR="/etc/unbound/unbound.conf.d"

if [ ! -d "$CONFIG_DIR" ]; then
  echo "Making dir $CONFIG_DIR"
  mkdir -p "$CONFIG_DIR"
fi

CONFIG_TEMPLATE='server:
    interface: ${IP}
    access-control: ${IP}/32 allow
    access-control: ::1 allow
    cache-max-ttl: 14400
    cache-min-ttl: 300
    do-ip4: yes
    do-ip6: no
    do-udp: yes
    do-tcp: yes
    use-caps-for-id: no
    prefetch: yes
    verbosity: 1'

add_ip_to_interface() {
  local ip=$1
  if ! ip addr show "$INTERFACE" | grep -q "$ip"; then
    echo "Info: Add IP $ip to interface $INTERFACE"
    ip addr add "$ip"/32 dev "$INTERFACE"
  else
    echo "Info: IP $ip already added to $INTERFACE"
  fi
}

create_unbound_config() {
  local ip=$1
  local config_file="$CONFIG_DIR/unbound_${ip//./_}.conf"
  echo "Info: Making Unbound config: $config_file"
  echo "${CONFIG_TEMPLATE//\$\{IP\}/$ip}" > "$config_file"
}

start_unbound_instance() {
  local ip=$1
  local config_file="$CONFIG_DIR/unbound_${ip//./_}.conf"
  echo "Info: Running Unbound instance $config_file"
  unbound -c "$config_file" &
}

IFS=',' read -r -a IP_ARRAY <<< "$RESOLVERS"

for ip in "${IP_ARRAY[@]}"; do
  add_ip_to_interface "$ip"
  create_unbound_config "$ip"
  start_unbound_instance "$ip"
done

echo "Info: Unbound instances was successfully launched."
