#!/bin/bash

# Build the Next.js app
echo "Building Next.js app..."
npm run build

# Check if build succeeded
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

# Copy static files to standalone directory
echo "Copying static files..."
cp -r .next/static .next/standalone/.next/

# Ensure public files are copied
if [ -d "public" ]; then
    cp -r public .next/standalone/
fi

echo "Build complete!"
