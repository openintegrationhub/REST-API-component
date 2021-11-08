#!/bin/sh

# check whether NODE_EXCHANGE is a non-null/non-zero string
if [ -n "$NODE_EXCHANGE" ]; then
  # if NODE_EXCHANGE present, run latest version of ferryman
  node ./node_modules/@openintegrationhub/ferryman/runGlobal.js
else
  # if NODE_EXCHANGE not present, run ferryman version 1.7.0 
  node ./node_modules/@openintegrationhub/ferryman-1-7-0/runGlobal.js
fi