#!/bin/sh
# setup-mosquitto.sh
# Roda UMA VEZ para criar o arquivo de senhas do Mosquitto.
# Execute dentro do container ou na VPS antes de subir.
#
# Uso:
#   chmod +x setup-mosquitto.sh
#   ./setup-mosquitto.sh
#
# O arquivo passwd gerado deve ficar em:
#   ./mosquitto/config/passwd

set -e

PASSWD_FILE="./mosquitto/config/passwd"

echo "=== Setup Mosquitto passwd ==="

# Verifica se mosquitto_passwd está disponível
if ! command -v mosquitto_passwd > /dev/null 2>&1; then
  echo "mosquitto_passwd não encontrado. Instalando..."
  apt-get update -qq && apt-get install -y -qq mosquitto
fi

# Usuário de healthcheck interno (sem acesso a tópicos reais)
echo ""
echo "Criando usuário 'healthcheck'..."
read -s -p "Senha para 'healthcheck': " HC_PASS
echo ""
mosquitto_passwd -b "$PASSWD_FILE" healthcheck "$HC_PASS"

# Usuário do backend Node.js (para se inscrever em tópicos cpd/#)
echo ""
echo "Criando usuário 'cpd-backend'..."
read -s -p "Senha para 'cpd-backend': " BACKEND_PASS
echo ""
mosquitto_passwd -b "$PASSWD_FILE" cpd-backend "$BACKEND_PASS"

echo ""
echo "Arquivo gerado em: $PASSWD_FILE"
echo ""
echo "IMPORTANTE: Adicione as seguintes variáveis ao .env do backend:"
echo "  MQTT_BROKER_USER=cpd-backend"
echo "  MQTT_BROKER_PASSWORD=<senha que você digitou>"
echo ""
echo "E adicione ao .env principal:"
echo "  MOSQUITTO_HEALTHCHECK_PASS=<senha do healthcheck>"
echo ""
echo "Os ESP32 usam token próprio por device (não este usuário)."
echo "O Mosquitto autentica os ESP32 via plugin ou allow_anonymous=false"
echo "com usuário igual ao mqtt_client_id e senha = token do device."
echo ""
echo "=== Concluído ==="
