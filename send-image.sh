#!/bin/bash
# Send an image/file to John via iMessage by uploading and sending the link
FILE="$1"
PHONE="+19292910750"

if [ ! -f "$FILE" ]; then
    echo "File not found: $FILE"
    exit 1
fi

# Upload to tmpfiles.org (free, no signup, files last 60 min)
RESPONSE=$(curl -s --max-time 15 -F "file=@${FILE}" https://tmpfiles.org/api/v1/upload)
# Extract URL and convert to direct download link
RAW_URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

if [ -z "$RAW_URL" ]; then
    echo "Upload failed: $RESPONSE"
    exit 1
fi

# Convert http://tmpfiles.org/12345/file.png to http://tmpfiles.org/dl/12345/file.png
URL=$(echo "$RAW_URL" | sed 's|tmpfiles.org/|tmpfiles.org/dl/|')

# Send the URL via iMessage
osascript -e "tell application \"Messages\"
    set targetService to (service 1 whose service type is iMessage)
    set targetBuddy to buddy \"$PHONE\" of targetService
    send \"$URL\" to targetBuddy
end tell"

echo "$URL"
