import { ComponentPalette } from './ComponentPalette';
import { LayerTree } from './LayerTree';
import { UICanvas } from './UICanvas';
import { UIPropertyPanel } from './UIPropertyPanel';
import './UIEditor.css';

export function UIEditor() {
  return (
    <div className="ui-editor">
      <aside className="ui-editor-left">
        <div className="ui-editor-left-top">
          <ComponentPalette />
        </div>
        <div className="ui-editor-left-bottom">
          <LayerTree />
        </div>
      </aside>

      <main className="ui-editor-canvas">
        <UICanvas />
      </main>

      <aside className="ui-editor-right">
        <UIPropertyPanel />
      </aside>
    </div>
  );
}
