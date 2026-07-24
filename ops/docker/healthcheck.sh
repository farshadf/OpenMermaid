#!/bin/sh
set -eu

exec wget -q --spider -T 3 -Y off http://127.0.0.1:8080/healthz
