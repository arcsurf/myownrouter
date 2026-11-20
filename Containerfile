FROM docker.io/library/debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential file gawk gettext git libncurses-dev python3 python3-setuptools rsync unzip wget zstd ca-certificates perl xz-utils && rm -rf /var/lib/apt/lists/*
