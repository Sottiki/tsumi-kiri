/**
 * PJTタブ（tasks.md 8-1、SPEC 3.1「PJTタブ」、決定事項16・76〜80、architecture.md 8章）
 *
 * 画面の一番上に、PJTのタブを横に並べる。右端に「＋」（PJTを足す）。
 * - タブを押すと、そのPJTに切り替える（元に戻すの対象にしない。決定事項43）
 * - 「＋」で新しいPJTを足し、PJT名の欄にカーソルを入れて名前を選んだ状態にする（決定事項80）
 * - どのタブにも、名前の右に「▾」のメニュー。中身は「削除」だけ（決定事項77）。
 *   押してもタブは切り替えない。削除は確認ダイアログを出してから行う（決定事項78）
 * - タブをマウスでドラッグして並べ替える（決定事項79。状態は useTabDrag.ts）
 *
 * ■ タブの作り
 * タブは、ふつうのボタン（名前）にする。ARIA の tab（role="tab"）にはしない。
 * tab にすると、矢印キーでタブを移る操作を足す決まりがあり、ブラウザの基本の操作（Tab キーで順に移る）と変わるため（決定事項74 と同じ考え方）。
 * 表示中のタブには aria-current="page" を付け、読み上げで「今のページ」と伝える。
 *
 * 見た目は画面案にないので、DESIGN.md のトークンで作る（Components Not In The Mockup：PJTタブ）。
 */

import { DndContext, DragOverlay, useDraggable } from '@dnd-kit/core';
import { useRef, useState, type CSSProperties } from 'react';
import { countAllTasks } from '../../core/tree';
import type { Project } from '../../core/types';
import { useAppStore } from '../../store';
import { ConfirmDialog } from '../ConfirmDialog';
import { cx } from '../cx';
import { keepHorizontal } from '../drag';
import { ChevronDownIcon, PlusIcon } from '../icons';
import { MenuItem, MenuNote, PopoverMenu } from '../PopoverMenu';
import { focusProjectName } from '../ProjectHeader';
import { useTabDrag } from './useTabDrag';
import styles from './ProjectTabs.module.css';

/** 写しの重なりの順。詳細パネル（10）より手前。青い線（ProjectTabs.module.css の .dropLine、21）はさらに手前 */
const DRAG_OVERLAY_Z_INDEX = 20;

export function ProjectTabs() {
  const projects = useAppStore((state) => state.data.projects);
  const activeProjectId = useAppStore((state) => state.data.activeId);
  const { addProject, selectProject, deleteProject, reorderProject } = useAppStore(
    (state) => state.actions,
  );

  /** 削除の確認を出しているPJT。出していなければ null */
  const [deleting, setDeleting] = useState<Project | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const drag = useTabDrag({ projects, listRef, onReorder: reorderProject });
  const draggedProject = projects.find((p) => p.id === drag.activeId);

  /** 「＋」：PJTを足し、PJT名の欄にカーソルを入れる（決定事項80） */
  const handleAdd = () => {
    addProject();
    // ストアを変えた後、画面が新しいPJTの名前で描き直されてから、欄を選ぶ。
    // 描き直しはこの関数が終わった後に行われるので、次の描画の前（requestAnimationFrame）まで待つ
    requestAnimationFrame(() => {
      focusProjectName();
      // 足したタブが帯の外（右端の先）にあれば、見える所までスクロールする
      listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  // 最後の1つのPJTは削除できない（SPEC 3.1）
  const canDelete = projects.length > 1;

  return (
    <nav className={styles.bar} aria-label="PJT">
      <DndContext {...drag.contextProps}>
        <div ref={listRef} className={styles.list}>
          {projects.map((project) => (
            <ProjectTab
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
              dimmed={project.id === drag.activeId}
              canDelete={canDelete}
              onSelect={selectProject}
              onDelete={setDeleting}
            />
          ))}
        </div>
        {/* 指についてくる写し。横にだけ動く。落としたときの動きは付けない（DESIGN.md の Motion） */}
        <DragOverlay
          dropAnimation={null}
          modifiers={[keepHorizontal]}
          zIndex={DRAG_OVERLAY_Z_INDEX}
        >
          {draggedProject !== undefined && (
            <TabCopy project={draggedProject} active={draggedProject.id === activeProjectId} />
          )}
        </DragOverlay>
      </DndContext>

      {/*
        落とす位置の青い縦線。写しに隠れないよう、写しより手前に、画面に固定した位置で描く（段階7のタスクと同じ）。
        data-drop-project・data-drop-edge は、画面のテストで線の位置を確かめるための目印
      */}
      {drag.dropLine !== null && (
        <div
          className={styles.dropLine}
          style={
            {
              left: drag.dropLine.left,
              top: drag.dropLine.top,
              height: drag.dropLine.height,
            } as CSSProperties
          }
          data-drop-project={drag.dropLine.projectId}
          data-drop-edge={drag.dropLine.edge}
        />
      )}

      <button type="button" className={styles.add} aria-label="PJTを追加" onClick={handleAdd}>
        <PlusIcon />
      </button>

      {deleting !== null && (
        <ConfirmDialog
          title={`「${deleting.name}」を削除しますか？`}
          messages={deleteMessages(deleting)}
          confirmLabel="削除"
          onConfirm={() => {
            deleteProject(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </nav>
  );
}

/** PJTの削除の確認に出す説明（決定事項78）。タスクの件数と、元に戻せること */
function deleteMessages(project: Project): string[] {
  const count = countAllTasks(project);
  const tasks =
    count === 0 ? 'このPJTにはタスクがありません。' : `タスク${count}件も一緒に削除されます。`;
  return [tasks, '元に戻す（Ctrl+Z）で戻せます。'];
}

// ---------------------------------------------------------------------------
// タブ1つ
// ---------------------------------------------------------------------------

interface ProjectTabProps {
  project: Project;
  /** 表示中のPJTのタブか */
  active: boolean;
  /** ドラッグ中に、元の場所として薄くするか */
  dimmed: boolean;
  /** 削除できるか（最後の1つでないか） */
  canDelete: boolean;
  onSelect: (projectId: string) => void;
  onDelete: (project: Project) => void;
}

function ProjectTab({ project, active, dimmed, canDelete, onSelect, onDelete }: ProjectTabProps) {
  /**
   * タブをマウスで掴めるようにする。dnd-kit の attributes（role・tabIndex）は付けない（決定事項74）。
   * 名前のボタンの上で押しても掴める。メニューのボタンの上（data-no-drag）では掴まない（ui/drag.ts）
   */
  const { setNodeRef, listeners } = useDraggable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cx(styles.tab, active && styles.tabActive, dimmed && styles.tabDimmed)}
      data-project-id={project.id}
    >
      {/* title：名前を「…」で切ったときに、マウスを乗せると全部の名前が出るように */}
      <button
        type="button"
        className={styles.name}
        aria-current={active ? 'page' : undefined}
        title={project.name}
        onClick={() => onSelect(project.id)}
      >
        {project.name}
      </button>
      <PopoverMenu
        buttonClassName={styles.menuButton}
        buttonLabel={`「${project.name}」のメニュー`}
        buttonContent={<ChevronDownIcon />}
        align="start"
      >
        <MenuItem onSelect={() => onDelete(project)} disabled={!canDelete}>
          削除
        </MenuItem>
        {!canDelete && <MenuNote>最後のPJTは削除できません</MenuNote>}
      </PopoverMenu>
    </div>
  );
}

/**
 * ドラッグ中に指についてくる、タブの写し。中身はタブと同じだが、操作はできない（inert）。
 * 大きさは、掴んだタブと同じになる（DragOverlay が合わせる）
 */
function TabCopy({ project, active }: { project: Project; active: boolean }) {
  return (
    <div className={cx(styles.tab, active && styles.tabActive, styles.tabOverlay)} inert>
      <span className={styles.name}>{project.name}</span>
      <span className={styles.menuButton}>
        <ChevronDownIcon />
      </span>
    </div>
  );
}
