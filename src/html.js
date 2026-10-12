// 画面は Preact ＋ htm（タグ付きテンプレート）で書く。ビルドなしで JSX の代わりになる。
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
