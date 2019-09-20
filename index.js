module.exports = function(source) {
  const parsedCSS = parseCSS(source);
  return `module.exports = ${ JSON.stringify(parsedCSS) }`;
}

/**
 * Enum with the list of available matchers
 */
const cssPartEnum = {
  selector: 1,
  variable: 2,
  property: 3,
  url: 4,
};

/**
 * Parse incoming CSS code and convert it to parts array
 * @param {String} cssCode    Piece of CSS code passed as string
 * @param {Object} options    Parsing options object { matchers: Array<cssPartEnum> }
 * @returns {Array}           Array of matched CSS parts
 */
const parseCSS = (cssCode, options = {}) => {
  const replacers = [];
  const processors = (options && options.matchers) || [cssPartEnum.selector, cssPartEnum.variable, cssPartEnum.property, cssPartEnum.url];

  for (let i = 0, match; i < processors.length; i++) {
    const { reg, handler } = matchers[processors[i]];
    reg.lastIndex = 0;
    while ((match = reg.exec(cssCode)) !== null) {
      handler(match, (data) => { replacers.push(data) });
    }
  }

  if (!replacers.length) {
    return [cssCode];
  }

  let result = [];
  replacers.sort((a, b) => {
    return a.index - b.index;
  });

  let cursor = 0;
  for (let i = 0; i < replacers.length; i++) {
    const replacer = replacers[i];
    const { index, length } = replacer;

    delete replacer.index;
    delete replacer.length;
    result.push(cssCode.substring(cursor, index), replacer);
    cursor = index + length;
  }

  if (cursor < cssCode.length) {
    result.push(cssCode.substr(cursor))
  }

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (typeof item === 'string' && item.length === 0) {
      result.splice(i, 1);
      i--;
    }
  }

  return result;
};

/**
 * Converts parsed CSS to string without any processing
 * @param {Array|String} parsed     Array of CSS parts or original CSS code
 * @param {String} parsed CSS
 */
const parsedToCSS = (parsed) => {
  if (typeof parsed === 'string') {
    return parsed;
  }

  const cssCode = [];
  for (let i = 0; i < parsed.length; i++) {
    const part = parsed[i];
    if (typeof part === 'string') {
      cssCode.push(part);
      continue;
    }
    switch (part.type) {
      case cssPartEnum.url:
      case cssPartEnum.selector:
        cssCode.push(part.value);
        break;
      case cssPartEnum.variable:
        cssCode.push(`--var(${part.value})`);
        break;
    }
  }
  return cssCode.join('');
}

/**
 * CSS code matchers
 */
const matchers = {
  [cssPartEnum.selector]: {
    reg: /(^\s*?|\n\s*?|}\s*)([a-z0-9 =_,+^*$"'> \t\r\n[\]():\-.#]+){/gi,
    handler: (match, addReplacer) => {
      const [, selectorBefore, selectorList] = match;
      const selectors = selectorList.split(',');

      for (let i = 0, acc = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        const trimmedSelector = selector.trim();

        switch(trimmedSelector) {
          case ':root':
          case 'from':
          case 'to':
            acc += selector.length + ','.length;
            continue;
        }

        addReplacer({
          type: cssPartEnum.selector,
          value: trimmedSelector,
          index: match.index + selectorBefore.length + acc,
          length: selector.length,
        });

        acc += selector.length + ','.length;
      }
    }
  },
  [cssPartEnum.variable]: {
    reg: /var\(--([a-z0-9]*)\)/gi,
    handler: (match, addReplacer) => {
      const [fullMatch, varName] = match;

      const replacer = {
        type: cssPartEnum.variable,
        value: varName,
        index: match.index,
        length: fullMatch.length,
      };

      // check if we need to escape variable value (in case if this is an attribute of inlined SVG or inside the quotes)
      const needsEncoding = (match.input.charAt(match.index - 2) === '=' || match.input.charAt(match.index + match.length) === "'");
      if (needsEncoding) {
        replacer.encode = true;
      }

      addReplacer(replacer);
    }
  },
  [cssPartEnum.property]: {
    reg: /([\s\S]*:root.*?{)([^}]*)}/gmi,
    handler: (match, addReplacer) => {
      const [, matchStart, items] = match;
      const pairs = items.split(';');

      for (let i = 0, acc = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        let [propName, propValue] = pair.split(':');

        if (!propName || !propValue) {
          acc += pair.length;
          continue;
        }

        propName = propName.trim().replace(/^--/, '');
        propValue = propValue.trim();

        addReplacer({
          type: cssPartEnum.property,
          value: { propName, propValue},
          index: match.index + matchStart.length + acc,
          length: pair.length + ':'.length,
        });

        acc += pair.length + ';'.length;
      }
    }
  },
  [cssPartEnum.url]: {
    reg: /(:.*?url.*?\(\s*(?:'|")?)(.+?)((?:'|"\s*)?\))/gi,
    handler: (match, addReplacer) => {
      const [, selectorBefore, url] = match;
      if (url.indexOf('var(--') < 0) {
        addReplacer({
          type: cssPartEnum.url,
          value: url,
          index: match.index + selectorBefore.length,
          length: url.length,
        });
      }
    }
  },
};
