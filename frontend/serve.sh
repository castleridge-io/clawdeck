#!/bin/bash
cd "$(dirname "$0")"
echo "Serving frontend at http://192.168.50.106:3002"
echo "Press Ctrl+C to stop"
python3 -m http.server 3002
