#!/bin/bash
if [ -z "$WORKER_API_URL" ]; then
    echo "ERRO FATAL: Variavel WORKER_API_URL nao configurada."
    exit 1
fi
sed -i "s|__WORKER_API_URL__|${WORKER_API_URL}|g" *.html
echo "Build OK: API apontada dinamicamente para ${WORKER_API_URL}"
