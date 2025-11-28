#!/bin/bash
# Script para sincronizar cambios a rafagent-engine SIN archivos con secrets

echo "🔄 Sincronizando cambios a rafagent-engine (solo código, sin secrets)..."

# Crear branch temporal desde engine/main
git checkout -b sync-clean-to-engine engine/main

# Archivos a sincronizar (solo código backend, sin secrets)
FILES_TO_SYNC=(
  "server/"
  "shared/"
  "migrations/"
  "package.json"
  "package-lock.json"
  "drizzle.config.ts"
  "tsconfig.json"
  "railway.json"
)

# Agregar solo los archivos necesarios desde origin/main
for file in "${FILES_TO_SYNC[@]}"; do
  if [ -e "$file" ]; then
    echo "✅ Copiando: $file"
    git checkout origin/main -- "$file" 2>/dev/null || echo "⚠️  No encontrado en origin/main: $file"
  fi
done

# Commit
git add -A
git commit -m "feat: Add multiple mailboxes system and fix manual reply detection

- Add mailboxes table schema and migration
- Implement mailbox management service
- Add mailbox API endpoints (CRUD operations)
- Add mailbox rotation and daily limit tracking
- Integrate OAuth flow for adding new mailboxes
- Auto-sync user main mailbox on login
- Fix: Improve manual reply detection to avoid false positives
- Fix: Make serveStatic optional for Railway backend-only"

# Push a engine
echo "📤 Haciendo push a rafagent-engine..."
if git push engine sync-clean-to-engine:main; then
  echo "✅ Push exitoso!"
else
  echo "⚠️  Push falló. Esto puede ser por secrets en commits antiguos."
  echo "💡 Opción: Usa los links que GitHub proporcionó para permitir los secrets temporalmente"
  echo "   O elimina los archivos con secrets del historial de rafagent-engine"
fi

# Volver a main
git checkout main
git branch -D sync-clean-to-engine

echo "✅ Proceso completado!"

