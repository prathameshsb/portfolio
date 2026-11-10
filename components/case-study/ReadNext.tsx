import { NativeContent } from '@/components/content/NativeContent';
import type { NativeNode } from '@/lib/content/types';
import './read-next.css';
import '../site/social-interactions.css';

function readNextNode(node: NativeNode, insideLink = false): NativeNode {
  const attrs = { ...node.attrs };
  const link = node.tag === 'a';
  if (link) attrs['data-read-next-link'] = true;
  if (insideLink && attrs['data-nested-link']) {
    delete attrs.role;
    delete attrs.tabIndex;
    attrs['data-read-next-surface'] = true;
  }
  return { ...node, attrs, children: node.children?.map(child => typeof child === 'string' ? child : readNextNode(child, insideLink || link)) };
}

export function ReadNext({ node }: { node: NativeNode }) {
  return <NativeContent node={readNextNode({ ...node, attrs: { ...node.attrs, 'data-portfolio-read-next': true } })} />;
}

export function SocialLinks({ node }: { node: NativeNode }) {
  return <NativeContent node={{ ...node, attrs: { ...node.attrs, 'data-portfolio-social': true } }} />;
}
