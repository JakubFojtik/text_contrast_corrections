(ls -r -inc "*.js").fullname | %{js-beautify $_ -r -n}
