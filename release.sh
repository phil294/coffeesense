#!/bin/bash
set -e

# increase package.json version field beforehand in both . and ./server

# update changelog

cd server
yarn preversion
npm publish
cd ..
yarn compile
yarn prepare-publish 
vsce package
vsce publish
git push origin master
yarn