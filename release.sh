#!/bin/bash
set -e

base_dir=$(dirname "$(readlink -f "$0")")

on_exit() {
	sed -i 's/^\s*debugger;/\/\/ debugger; sdfsdf/' "$base_dir"/server/node_modules/typescript/lib/typescript.js
}
trap on_exit exit

pause() {
	read -r -n 1 -s -p 'Press any key to continue. . .'
	echo
}

yarn
yarn upgrade
cd server
yarn upgrade
cd ..
pause

echo 'update changelog'
pause

yarn test

echo 'update package.json version in both . and ./server'
pause

cd server
yarn preversion
npm publish

cd ..
yarn compile
yarn prepare-publish
rm -rf server/node_modules/coffeescript/{docs,documentation,.github,test,src}
rm -rf server/node_modules/coffeescript/lib/{coffeescript,coffeescript-browser-compiler-legacy}
vsce package
echo TODO: vsce publish
# vsce publish
pause

git push origin master

yarn