import { createWidget, deleteWidget, widget, prop, align, text_style } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'

const info = getDeviceInfo()
export const W = info.width || 432
export const H = info.height || 514
const K = W / 432 // escala respecto al Bip Max
export const s = (v) => Math.round(v * K)
export const M = s(28) // margen lateral (esquinas redondeadas)

export const C = {
  bg: 0x000000,
  text: 0xffffff,
  dim: 0x9ca3af,
  work: 0x4ade80,
  rest: 0x60a5fa,
  pause: 0xfbbf24,
  danger: 0xf87171,
  panel: 0x1f2937,
  btn: 0x374151,
  btnPress: 0x4b5563,
}

export function text(o) {
  return createWidget(widget.TEXT, {
    x: o.x === undefined ? M : o.x,
    y: o.y,
    w: o.w === undefined ? W - 2 * M : o.w,
    h: o.h,
    text: o.text || '',
    text_size: o.size || s(28),
    color: o.color === undefined ? C.text : o.color,
    align_h: o.left ? align.LEFT : o.right ? align.RIGHT : align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: o.wrap ? text_style.WRAP : text_style.ELLIPSIS,
  })
}

export function rect(o) {
  return createWidget(widget.FILL_RECT, {
    x: o.x || 0, y: o.y || 0, w: o.w === undefined ? W : o.w, h: o.h === undefined ? H : o.h,
    radius: o.radius || 0, color: o.color === undefined ? C.bg : o.color,
  })
}

export function button(o) {
  return createWidget(widget.BUTTON, {
    x: o.x === undefined ? M : o.x,
    y: o.y,
    w: o.w === undefined ? W - 2 * M : o.w,
    h: o.h || s(76),
    radius: s(38),
    text: o.text,
    text_size: o.size || s(30),
    color: o.textColor === undefined ? C.text : o.textColor,
    normal_color: o.color === undefined ? C.btn : o.color,
    press_color: o.press === undefined ? C.btnPress : o.press,
    click_func: o.onClick,
  })
}

export function setText(w, t) {
  if (w) w.setProperty(prop.MORE, { text: t })
}

export function setColor(w, color) {
  if (w) w.setProperty(prop.MORE, { color: color })
}

export function show(w, visible) {
  if (w) w.setProperty(prop.VISIBLE, !!visible)
}

export function remove(w) {
  if (w) deleteWidget(w)
}
