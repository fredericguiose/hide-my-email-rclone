#!/usr/bin/env bash
# Hide My Email depuis Chrome, via la session rclone iCloud.
# Déclare le relais native messaging aux navigateurs Chromium de l'utilisateur.
# Idempotent : relançable sans risque. Prérequis : rclone avec un remote
# iCloud Drive connecté (nom « icloud », ou HME_RCLONE_REMOTE).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOST="$HERE/native-host/hme-host"
NAME=com.fredericguiose.hme

command -v rclone >/dev/null || { echo "✗ rclone absent : https://rclone.org/install/"; exit 1; }
REMOTE="${HME_RCLONE_REMOTE:-icloud}"
rclone listremotes --long --ask-password=false 2>/dev/null | grep -q "^$REMOTE:.*iclouddrive" \
  || echo "⚠ remote « $REMOTE » introuvable ou config illisible : rclone config create $REMOTE iclouddrive"

# Identifiant de l'extension non empaquetée = sha256 de sa clé publique,
# 32 premiers chiffres hexadécimaux traduits en a–p.
ID="$(python3 -I - "$HERE/extension/manifest.json" <<'EOF'
import base64, hashlib, json, sys
key = base64.b64decode(json.load(open(sys.argv[1]))["key"])
print(hashlib.sha256(key).hexdigest()[:32].translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop")))
EOF
)"

chmod +x "$HOST"
installed=0
for dir in ~/.config/google-chrome ~/.config/chromium ~/.config/BraveSoftware/Brave-Browser \
           ~/.config/microsoft-edge ~/.config/vivaldi; do
  [ -d "$dir" ] || continue
  mkdir -p "$dir/NativeMessagingHosts"
  cat > "$dir/NativeMessagingHosts/$NAME.json" <<EOF
{
  "name": "$NAME",
  "description": "Hide My Email : relais vers iCloud avec la session rclone",
  "path": "$HOST",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
EOF
  echo "✓ Relais déclaré pour $(basename "$dir")"
  installed=1
done
[ "$installed" = 1 ] || echo "⚠ Aucun navigateur Chromium trouvé dans ~/.config."

echo "Identifiant de l'extension : $ID"
echo "Reste à la main (une fois) : chrome://extensions → Mode développeur →"
echo "« Charger l'extension non empaquetée » → $HERE/extension"
