
# Lazy image loader web extension

A simple web extension to block images on a page by default. The images can
later be displayed selectively by hovering over the blocked image whilst
keeping Ctrl+Alt pressed.

Works for
[Firefox](https://addons.mozilla.org/firefox/addon/lazy-image-loader) and
[Chrome](https://chrome.google.com/webstore/detail/lazy-image-loader/ioiepeflnpgjmlngjjedadabagckkhda).

See the screen shot below for the extension in action.

![demo](files/demo.gif)

## Instructions for local build

```sh
npm install
make
```

Load extension from the directory `lazy-image-loader-VV`.

To build the `zip` file:

```sh
make zip
```

<!-- vim: set tw=80 spell: -->
