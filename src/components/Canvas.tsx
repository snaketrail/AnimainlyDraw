/**
 * The page canvas.
 *
 * Konva objects are positioned purely from the store. During a drag we write
 * live updates back to the store and let it re-render; we never let the node
 * hold a position the store doesn't know about. That is the whole fix for the
 * old app's "everything jumps to a random spot" bug.
 *
 * Art belonging to a panel is drawn inside a clipped Group, so it can be
 * dragged around freely and only ever shows through its own frame — the way a
 * manga panel actually crops its artwork.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Rect,
  Group,
  Image as KonvaImage,
  Shape,
  Text,
  Transformer,
} from 'react-konva'
import type Konva from 'konva'
import { useStore } from '../store/useStore'
import {
  clampToPage,
  innerFrame,
  isBubble,
  isImage,
  pageSizeOf,
  panelRect,
  type BubbleObject,
  type ImageObject,
  type Panel,
  type PageSize,
} from '../lib/types'
import { drawBubble, textInset } from '../lib/bubbles'
import { assetUrl } from '../lib/storage'

const SEAL = '#c8362b'

/** Loads an asset's bitmap once and hands it to Konva. */
function useAssetImage(assetId: string): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement>()

  useEffect(() => {
    let cancelled = false
    void assetUrl(assetId).then((url) => {
      if (!url || cancelled) return
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImage(img)
      }
      img.src = url
    })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return image
}

function PlacedImage({ object }: { object: ImageObject }) {
  const image = useAssetImage(object.assetId)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const updateObject = useStore((s) => s.updateObject)
  const commitObject = useStore((s) => s.commitObject)
  const nodeRef = useRef<Konva.Image>(null)

  if (!image) return null

  const selected = selectedId === object.id

  return (
    <KonvaImage
      ref={nodeRef}
      id={object.id}
      image={image}
      x={object.x}
      y={object.y}
      width={object.width}
      height={object.height}
      rotation={object.rotation}
      opacity={object.opacity}
      scaleX={object.flipX ? -1 : 1}
      // A negative scaleX mirrors about the left edge, which would shift the
      // image off its own footprint. Offsetting by the width pins it in place.
      offsetX={object.flipX ? object.width : 0}
      draggable
      onMouseDown={() => select(object.id)}
      onTap={() => select(object.id)}
      onDragMove={(e) => {
        const node = e.target
        updateObject(object.id, {
          x: object.flipX ? node.x() - object.width : node.x(),
          y: node.y(),
        })
      }}
      onDragEnd={(e) => {
        const node = e.target
        commitObject(object.id, {
          x: object.flipX ? node.x() - object.width : node.x(),
          y: node.y(),
        })
      }}
      onTransformEnd={() => {
        const node = nodeRef.current
        if (!node) return

        // Konva reports a transform as a scale factor. We fold it back into
        // real width/height and reset the scale, so the store never holds a
        // second, competing notion of size.
        const scaleX = Math.abs(node.scaleX())
        const scaleY = Math.abs(node.scaleY())
        const width = Math.max(20, node.width() * scaleX)
        const height = Math.max(20, node.height() * scaleY)

        node.scaleX(object.flipX ? -1 : 1)
        node.scaleY(1)

        commitObject(object.id, {
          x: object.flipX ? node.x() - width : node.x(),
          y: node.y(),
          width,
          height,
          rotation: node.rotation(),
        })
      }}
      stroke={selected ? SEAL : undefined}
      strokeWidth={selected ? 2 : 0}
      strokeScaleEnabled={false}
    />
  )
}

/** One panel: its clipped contents, then its frame drawn on top. */
function PanelGroup({
  panel,
  size,
  objects,
}: {
  panel: Panel
  size: PageSize
  objects: ImageObject[]
}) {
  const selectedPanelId = useStore((s) => s.selectedPanelId)
  const selectPanel = useStore((s) => s.selectPanel)
  const updatePanel = useStore((s) => s.updatePanel)
  const frameRef = useRef<Konva.Rect>(null)
  const box = panelRect(panel, size)
  const selected = selectedPanelId === panel.id
  const empty = objects.length === 0

  return (
    <>
      <Group
        clipX={box.x}
        clipY={box.y}
        clipWidth={box.width}
        clipHeight={box.height}
      >
        <Rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="#ffffff"
          onMouseDown={() => selectPanel(panel.id)}
          onTap={() => selectPanel(panel.id)}
        />
        {objects.map((object) => (
          <PlacedImage key={object.id} object={object} />
        ))}
      </Group>

      {/* The frame sits outside the clip so its stroke isn't halved by it.
          It is draggable and resizable, which is how panels get edited. */}
      <Rect
        ref={frameRef}
        id={`panel-${panel.id}`}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        stroke={selected ? SEAL : '#161412'}
        strokeWidth={selected ? 3 : 2}
        strokeScaleEnabled={false}
        // An empty panel is clickable anywhere; a filled one only on its edge,
        // so dragging the art inside stays the common case.
        fillEnabled={empty}
        fill={empty ? 'rgba(0,0,0,0.001)' : undefined}
        hitStrokeWidth={20}
        draggable={selected}
        onMouseDown={() => selectPanel(panel.id)}
        onTap={() => selectPanel(panel.id)}
        onDragEnd={(e) => {
          const frame = innerFrame(size)
          updatePanel(panel.id, {
            x: (e.target.x() - frame.x) / frame.width,
            y: (e.target.y() - frame.y) / frame.height,
          })
        }}
        onTransformEnd={() => {
          const node = frameRef.current
          if (!node) return
          const width = node.width() * Math.abs(node.scaleX())
          const height = node.height() * Math.abs(node.scaleY())
          node.scaleX(1)
          node.scaleY(1)
          const frame = innerFrame(size)
          updatePanel(panel.id, {
            x: (node.x() - frame.x) / frame.width,
            y: (node.y() - frame.y) / frame.height,
            w: width / frame.width,
            h: height / frame.height,
          })
        }}
      />
    </>
  )
}

/**
 * A speech bubble.
 *
 * Drawn at page level, never inside a panel's clip group, because manga
 * bubbles routinely straddle panel borders and sit in the gutter. They are
 * clamped to the printable page instead — past the trim they'd be cut off.
 */
function PlacedBubble({ bubble, size }: { bubble: BubbleObject; size: PageSize }) {
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const updateObject = useStore((s) => s.updateObject)
  const commitObject = useStore((s) => s.commitObject)
  const groupRef = useRef<Konva.Group>(null)

  const selected = selectedId === bubble.id
  const inset = textInset(bubble.kind)

  return (
    <Group
      ref={groupRef}
      id={bubble.id}
      x={bubble.x}
      y={bubble.y}
      width={bubble.width}
      height={bubble.height}
      rotation={bubble.rotation}
      draggable
      dragBoundFunc={(pos) => {
        // Konva reports stage coordinates, so convert to page units, clamp,
        // and convert back — this is what keeps a bubble on the paper.
        const stage = groupRef.current?.getStage()
        const scale = stage?.scaleX() ?? 1
        const clamped = clampToPage(
          { x: pos.x / scale, y: pos.y / scale, width: bubble.width, height: bubble.height },
          size,
        )
        return { x: clamped.x * scale, y: clamped.y * scale }
      }}
      onMouseDown={() => select(bubble.id)}
      onTap={() => select(bubble.id)}
      onDragMove={(e) => updateObject(bubble.id, { x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => commitObject(bubble.id, { x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = groupRef.current
        if (!node) return
        const width = Math.max(40, bubble.width * Math.abs(node.scaleX()))
        const height = Math.max(30, bubble.height * Math.abs(node.scaleY()))
        node.scaleX(1)
        node.scaleY(1)
        const clamped = clampToPage({ x: node.x(), y: node.y(), width, height }, size)
        commitObject(bubble.id, {
          ...clamped,
          width,
          height,
          rotation: node.rotation(),
        })
      }}
    >
      {/* The outline. Text is a separate node below, because drawing text
          through a custom sceneFunc runs it through the shape transform and
          renders it upside-down and mirrored. */}
      <Shape
        width={bubble.width}
        height={bubble.height}
        sceneFunc={(ctx, shape) => {
          drawBubble(
            ctx as unknown as CanvasRenderingContext2D,
            bubble.kind,
            {
              w: shape.width(),
              h: shape.height(),
              tailAngle: bubble.tailAngle,
              tailLength: bubble.tailLength,
              lineWidth: Math.max(2, bubble.fontSize * 0.09),
            },
            { fill: '#ffffff', stroke: '#161412' },
          )
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(0, 0, bubble.width, bubble.height)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
      />

      <Text
        x={(bubble.width * (1 - inset)) / 2}
        y={0}
        width={bubble.width * inset}
        height={bubble.height}
        text={bubble.text}
        fontSize={bubble.fontSize}
        fontFamily='"Comic Sans MS", "Segoe UI", sans-serif'
        fontStyle={
          bubble.kind === 'shout' ? 'bold' : bubble.kind === 'whisper' ? 'italic' : 'normal'
        }
        fill="#161412"
        align="center"
        verticalAlign="middle"
        lineHeight={1.25}
        listening={false}
      />

      {selected && (
        <Rect
          width={bubble.width}
          height={bubble.height}
          stroke={SEAL}
          strokeWidth={2}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </Group>
  )
}

export function Canvas() {
  const project = useStore((s) => s.project)
  const pageIndex = useStore((s) => s.currentPageIndex)
  const selectedId = useStore((s) => s.selectedId)
  const selectedPanelId = useStore((s) => s.selectedPanelId)
  const select = useStore((s) => s.select)
  const selectPanel = useStore((s) => s.selectPanel)
  const addAssets = useStore((s) => s.addAssets)

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [scale, setScale] = useState(0.2)
  const [dragOver, setDragOver] = useState(false)

  const size = pageSizeOf(project)
  const page = project.pages[pageIndex]
  const frame = innerFrame(size)

  // Fit the page to whatever room the viewport gives us.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const fit = () => {
      const pad = 48
      const w = el.clientWidth - pad
      const h = el.clientHeight - pad
      if (w <= 0 || h <= 0) return
      setScale(Math.min(w / size.width, h / size.height))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [size.width, size.height])

  // Point the transformer at whatever is selected — an object or a panel.
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    const id = selectedId ?? (selectedPanelId ? `panel-${selectedPanelId}` : null)
    const node = id ? stage.findOne(`#${id}`) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, selectedPanelId, page?.objects.length, page?.panels.length, pageIndex])

  if (!page) return null

  const floatingArt = page.objects.filter((o) => isImage(o) && !o.panelId) as ImageObject[]
  const bubbles = page.objects.filter(isBubble)

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${dragOver ? ' is-dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) void addAssets(files)
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width * scale}
        height={size.height * scale}
        scaleX={scale}
        scaleY={scale}
        className="stage"
        onMouseDown={(e) => {
          // A click on bare paper clears the selection.
          if (e.target === e.target.getStage() || e.target.name() === 'paper') {
            select(null)
            selectPanel(null)
          }
        }}
      >
        <Layer>
          <Rect
            name="paper"
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fill="#ffffff"
          />

          {/* Inner frame guide — the safe area. Never exported. */}
          {page.panels.length === 0 && (
            <Rect
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
              stroke="#c9c3b7"
              strokeWidth={1}
              dash={[6, 6]}
              strokeScaleEnabled={false}
              listening={false}
            />
          )}

          {page.panels.map((panel) => (
            <PanelGroup
              key={panel.id}
              panel={panel}
              size={size}
              objects={page.objects.filter(
                (o): o is ImageObject => isImage(o) && o.panelId === panel.id,
              )}
            />
          ))}

          {floatingArt.map((object) => (
            <PlacedImage key={object.id} object={object} />
          ))}

          {/* Above every panel, so a bubble can cross a border or sit in a gutter. */}
          {bubbles.map((bubble) => (
            <PlacedBubble key={bubble.id} bubble={bubble} size={size} />
          ))}

          <Transformer
            ref={trRef}
            // Panels stay axis-aligned; only objects rotate.
            rotateEnabled={!selectedPanelId}
            keepRatio={false}
            anchorSize={9}
            borderStroke={SEAL}
            borderStrokeWidth={1.5}
            anchorStroke={SEAL}
            anchorFill="#ffffff"
            anchorStrokeWidth={1.5}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>

      {page.objects.length === 0 && (
        <p className="canvas-hint">
          {page.panels.length === 0
            ? 'Pick a panel layout on the right, then click art to fill it'
            : 'Click art in the library to drop it into a panel'}
        </p>
      )}
    </div>
  )
}
