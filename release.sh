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
cd ../test/lsp/fixture
yarn upgrade
cd ../../..
pause

git fetch
changes=$(git log --reverse origin/master.. --pretty=format:"%h___%B" |grep . |sed -E 's/^([0-9a-f]{8})___(.)/- \1 \U\2/')
echo 'CHANGES, generated from commits since last git push:'
echo "$changes"
echo "---- (put into clipboard)"
echo "$changes" |xclip -sel c
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

npx vsce package

npx vsce publish
pause

npx ovsx publish "$(ls -tr coffeesense-*.vsix* |tail -1)" -p "$(cat ~/.open-vsx-access-token)"
pause

git push origin master

yarn