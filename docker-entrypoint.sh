#!/bin/sh
set -eu
./zephyr migrate
exec ./zephyr serve
