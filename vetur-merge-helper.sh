#!/bin/bash
# While merging upstream vuejs/vetur, run this script to remove a lot of stuff that is definitely not relevant to CoffeeSense
find server/src scripts test client vti -type f -not -path '*node_modules*' -not -path '*/.history*' -not -path '*/data-dir*' | egrep -i 'vue|template|prettier|grammar|interpolation|vti|pug|stylus|componentData' | xargs -I {} git rm {}