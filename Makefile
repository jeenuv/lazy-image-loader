
realpath_cmd = $(shell realpath -m --relative-to $1 $2)
bundle_cmd = npx esbuild --log-level=warning --bundle --outfile=$(call realpath_cmd,js,$1) $(call realpath_cmd,js,$2)

manifest := manifest.json
name := $(shell jq -r '.name|ascii_downcase|gsub(" ";"-")' $(manifest))
pkg := $(name)-$(shell jq -r .version $(manifest))

compiled := .compiled
bundled := .bundled
prettified := .prettified

js_srcs := $(addprefix js/,background.js lazy.js popup.js)
ts_srcs := $(wildcard src/*.ts)
target_files := $(addprefix $(pkg)/,$(wildcard res/*) manifest.json $(js_srcs))

.PHONY: bundle
bundle: $(bundled)

$(bundled): $(target_files)
	touch $@

$(pkg).zip: $(bundled)
	cd $(pkg) && zip -r $(call realpath_cmd,$(pkg),$@) .

$(pkg)/js/%.js: js/%.js
	cd js && $(call bundle_cmd,$@,$<)

$(pkg) $(pkg)/res:
	mkdir -p $@

$(pkg)/res/%: res/% | $(pkg)/res
	cp $< $@

$(pkg)/$(manifest): $(manifest) | $(pkg)
	cp $< $@

js/%.js: $(compiled) ;

$(compiled): $(ts_srcs)
	npx tsc
	touch $@

.PHONY: zip
zip: $(pkg).zip

.PHONY: pretty
pretty: $(prettified)

$(prettified): $(ts_srcs)
	npx prettier --config prettier.json -w $?
	touch $@

.PHONY: watch
watch:
	npx tsc --watch

.PHONY: clean
clean:
	rm -rf $(compiled) $(bundled) $(prettified) js $(name)* *.zip
