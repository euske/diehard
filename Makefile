# Makefile
RM=rm -f
TSC=tsc
PYTHON=python
RSYNC=rsync -auvz
WATCHER=$(PYTHON) tools/watcher.py

REMOTE_DIR=yourhost.example.com:public_html/game

D3=lib/d3.d.ts
D3TS_URL=https://raw.githubusercontent.com/types/npm-d3/a3171387d85d30049479ca880c617e63dca23afe/index.d.ts

all: js/game.js $(D3)
	cd assets; $(MAKE) $@

clean:
#	-cd assets; $(MAKE) $@
	-$(RM) -r js/game.js

watch:
	$(WATCHER) src/utils.ts src/geom.ts src/game.ts

upload: all
	$(RSYNC) --exclude '.*' --exclude '*.wav' --exclude Makefile index.html js assets $(REMOTE_DIR)

js/game.js: $(BASES) src/game.ts
	$(TSC)

lib/d3.d.ts:
	$(WGET) -o $@ $(D3TS_URL)
