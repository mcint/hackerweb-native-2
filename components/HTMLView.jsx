import { useEffect, useState } from 'react';
import {
  DynamicColorIOS,
  PlatformColor,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import * as Haptics from 'expo-haptics';

import * as entities from 'entities';
import { DomHandler } from 'domhandler';
import { Parser } from 'htmlparser2';
import stripIndent from 'strip-indent';
import urlRegexSafe from 'url-regex-safe';

import openBrowser from '../utils/openBrowser';
import openShare from '../utils/openShare';

import Text from './Text';

const baseFontSize = 15;
const nodeStyles = StyleSheet.create({
  default: {
    fontSize: baseFontSize,
  },
  p: {
    marginBottom: 12,
    fontSize: baseFontSize,
  },
  blockquote: {
    marginBottom: 12,
    fontSize: baseFontSize,
    backgroundColor: DynamicColorIOS({
      dark: 'rgba(255,255,255,.05)',
      light: 'rgba(0,0,0,.05)',
    }),
    padding: 8,
    opacity: 0.8,
  },
  pre: {
    backgroundColor: DynamicColorIOS({
      dark: 'rgba(255,255,255,.05)',
      light: 'rgba(0,0,0,.05)',
    }),
    borderRadius: 4,
    marginBottom: 12,
    'white-space': 'pre-wrap',
  },
  preInner: {
    padding: 10,
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: baseFontSize - 2,
  },
  a: {
    color: PlatformColor('link'),
    fontSize: baseFontSize,
  },
  i: {
    fontStyle: 'italic',
    fontSize: baseFontSize,
  },
});

const onLinkPress = (url) => {
  openBrowser(url);
};
const onLinkLongPress = (url) => {
  Haptics.selectionAsync();
  openShare({ url });
};

function PreView({ children, ...props }) {
  const windowHeight = useWindowDimensions().height;
  return (
    <ScrollView
      automaticallyAdjustContentInsets={false}
      scrollsToTop={false}
      style={[nodeStyles.pre, { maxHeight: windowHeight * 0.5 }]}
      decelerationRate={0} // Easier to read the code
      {...props}
    >
      <View style={nodeStyles.preInner} onStartShouldSetResponder={() => true}>
        {children}
      </View>
    </ScrollView>
  );
}

function dom2elements(nodes, parentName) {
  if (!nodes || !nodes.length) return;
  return nodes.map((node) => {
    const { name, type, children } = node;
    const key = (name || type) + '-' + Math.random();
    if (type === 'tag') {
      const style = nodeStyles[name || 'default'];
      var elements = dom2elements(children, name);
      if (!elements) return null;
      if (name === 'pre') {
        return <PreView key={key}>{elements}</PreView>;
      }
      if (name === 'a') {
        const { href } = node.attribs;
        // Steps to make sure children inside is ACTUALLY text
        const child = children && children.length === 1 && children[0];
        const text = child && child.type === 'text' && child.data;
        return (
          <Text
            key={key}
            style={style}
            onPress={onLinkPress.bind(null, href)}
            onLongPress={onLinkLongPress.bind(null, href)}
          >
            {text || elements}
          </Text>
        );
      }
      if (name === 'p') {
        let firstChild = children && children[0];
        if (firstChild.type === 'tag') {
          // Sometimes can be an <i> tag
          firstChild = firstChild.children && firstChild.children[0];
        }
        const firstText =
          firstChild && firstChild.type === 'text' && firstChild.data;
        if (
          (firstText && /^>{1,2}[^<>]+$/.test(firstText)) ||
          firstText === '>'
        ) {
          return (
            <Text key={key} style={nodeStyles.blockquote}>
              {elements}
            </Text>
          );
        }
      }
      return (
        <Text key={key} style={style}>
          {elements}
        </Text>
      );
    } else if (type === 'text') {
      const style = nodeStyles[parentName || 'default'];
      const { data } = node;
      let text;
      if (parentName === 'code') {
        // Trim EOL newline
        text = stripIndent(data.replace(/\n$/, ''));
      } else {
        // Trim ALL newlines, because HTML
        text = data.replace(/[\n\s\t]+/g, ' ');
      }
      return (
        <Text key={key} style={style}>
          {text}
        </Text>
      );
    }
  });
}

function processDOM(html, callback) {
  const handler = new DomHandler((err, dom) => {
    const elements = dom2elements(dom);
    callback(elements);
  });
  const parser = new Parser(handler, {
    recognizeSelfClosing: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    decodeEntities: true,
  });
  // Clean up HTML first
  if (!/^\s*<p>/i.test(html)) html = '<p>' + html;
  html = html
    .replace(/^\s*<p>\s*<pre>/i, '<pre>') // Stop <pre> from being wrapped by <p>
    .replace(/<p>\s*<pre>/gi, '</p><pre>') // Stop <pre> from being wrapped by <p>, part 2
    .replace(/<pre>\s*<code>/gi, '<pre><code>'); // Spaces between <pre> and <code> makes parser puke
  if (!/<\/pre>\s*<p>/i.test(html)) {
    html = html.replace(/<\/pre>([^<])/gi, '</pre><p>$1');
  }
  parser.write(html);
  parser.end();
}

const urlRegex = urlRegexSafe({
  localhost: false,
  strict: true,
});

export default function HTMLView({ html, linkify }) {
  if (!html.trim()) return null;
  const [elements, setElements] = useState(null);
  useEffect(() => {
    if (linkify) {
      const containsLink = /<\/a>/i.test(html);
      if (containsLink) {
        console.warn('HTML contains anchors and linkify=true', html);
      } else {
        html = entities
          .decodeHTML(html)
          .replace(/(<\w)/gi, '\n$1') // Some tags are too "sticky"
          .replace(urlRegex, (url) => `<a href="${url}">${url}</a>`);
      }
    }
    processDOM(html, setElements);
  }, [html, linkify]);
  return <View>{elements}</View>;
}
