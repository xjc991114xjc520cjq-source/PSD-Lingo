const JSZip = require('jszip');
const {DOMParser} = require('@xmldom/xmldom');
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
async function readDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Word 文档缺少正文 XML');
  const xml = await entry.async('string');
  const errors = [];
  const document = new DOMParser({errorHandler: {warning:()=>{}, error:m=>errors.push(m), fatalError:m=>errors.push(m)}}).parseFromString(xml, 'application/xml');
  if (errors.length || document.documentElement.localName !== 'document') throw new Error('Word 正文 XML 无法解析');
  const body = document.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Word 文档没有正文');
  function textOf(element) {
    if (element.nodeType !== 1) return '';
    const type = element.namespaceURI === WORD_NS ? element.localName : '';
    if (type === 'del' || type === 'instrText') return '';
    if (type === 't') return element.textContent;
    if (type === 'tab') return '\t';
    if (type === 'cr') return '\n';
    if (type === 'br') return element.getAttributeNS(WORD_NS, 'type') === 'page' ? '\n\n' : '\n';
    if (type === 'noBreakHyphen') return '\u2011';
    if (type === 'softHyphen') return '\u00AD';
    let text = '';
    for (let child = element.firstChild; child; child = child.nextSibling) text += textOf(child);
    return text + (type === 'p' ? '\n\n' : '');
  }
  return textOf(body);
}
module.exports = {readDocxText};
