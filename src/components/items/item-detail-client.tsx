'use client';

import { ItemMetadataEditor } from '@/components/items/item-metadata-editor';

type HeaderEditorProps = {
  itemId: string;
};

export function ItemHeaderEditor({ itemId }: HeaderEditorProps) {
  return <ItemMetadataEditor itemId={itemId} />;
}
