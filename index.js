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
 * @returns {Array}           Array of matched CSS parts
 */
const parseCSS = (cssCode) => {
  const replacers = [];
  for (let i = 0, match; i < matchers.length; i++) {
    const { reg, handler } = matchers[i];
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

  result = result.filter(item => {
    return (typeof item === 'string' && item.trim().length > 0) || item;
  });

  return result;
};

/**
 * Matchers
 */
const matchers = [
  {
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
  {
    reg: /var\(--([a-z0-9]*)\)/gi,
    handler: (match, addReplacer) => {
      const [fullMatch, varName] = match;

      // check if we need to escape variable value (in case if this is an attribute of inlined SVG or inside the quotes)
      const needsEscaping = (match.input.charAt(match.index - 2) === '=' || match.input.charAt(match.index + match.length) === "'");

      addReplacer({
        type: cssPartEnum.variable,
        value: varName,
        index: match.index,
        length: fullMatch.length,
        needsEscaping,
      });
    }
  },
  {
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
  {
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
];
