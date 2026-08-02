#!/bin/sh
# StreamVibe one-click installer for Termux
set -e

echo "=============================="
echo " StreamVibe Termux Installer"
echo "=============================="

echo "[1/4] Installing Python + ffmpeg..."
pkg update -y
pkg install -y python ffmpeg

echo "[2/4] Setting up storage access..."
termux-setup-storage

echo "[3/4] Preparing videos folder..."
mkdir -p "$HOME/streamsite/videos"

echo "[4/4] Starting the server..."
cd "$HOME/streamsite"
python server.py
