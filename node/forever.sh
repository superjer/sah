#!/usr/bin/env bash

while true
do
  nodejs server.js
  for i in 5 4 3 2 1
  do
    echo Restarting in $i seconds...
    sleep 1
  done
done
