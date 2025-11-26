<template>
  <div class="title-bar column no-wrap q-px-sm bg-dark text-white q-py-xs">
    <!-- Top Row: Window Controls & Actions -->
    <div class="row justify-between items-center full-width q-mb-xs">
      <!-- Window Controls (Mac-style) -->
      <div class="window-controls row no-wrap q-gutter-x-xs">
        <div class="control-btn close" @click="closeWindow"></div>
        <div class="control-btn minimize" @click="minimizeWindow"></div>
        <div class="control-btn maximize" @click="toggleMaximize"></div>
      </div>
    </div>

    <!-- Bottom Row: Search/Input Area -->
    <div class="title-input-wrapper full-width q-px-md scroll-y" :style="{ height: inputHeight + 'px' }">
      <q-input ref="inputRef" v-model="searchStore.text" borderless dense type="textarea" placeholder="Search..."
        class="title-input full-width" input-class="text-white"
        input-style="min-height: 24px; line-height: 1.5; resize: none;" @mouseup="onTextSelect" @keyup="onTextSelect"
        @paste="onPaste" />
    </div>

    <!-- Resize Handle -->
    <div class="resize-handle full-width" @mousedown="startDrag"></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSearchStore } from 'stores/search'

const searchStore = useSearchStore()
const inputRef = ref(null)
const inputHeight = ref(250)
const isDragging = ref(false)
const startY = ref(0)
const startHeight = ref(0)

function closeWindow() {
  window.ankify.hidePopover()
}

function minimizeWindow() {
  window.ankify.minimize()
}

function toggleMaximize() {
  window.ankify.toggleMaximize()
}

function onTextSelect(event) {
  const input = event.target
  const start = input.selectionStart
  const end = input.selectionEnd
  const selectedText = input.value.substring(start, end)

  searchStore.handleSelection(selectedText)
}

function onPaste() {
  // Wait a tick so the paste finishes first
  setTimeout(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.select()

      // Trigger search on the full text
      const text = searchStore.text
      if (text) {
        searchStore.handleSelection(text)
      }
    }
  }, 0)
}

// Drag logic
function startDrag(event) {
  console.log('[TitleBar] startDrag called', { clientY: event.clientY })
  event.preventDefault()
  event.stopPropagation() // Prevent parent drag region from interfering

  isDragging.value = true
  startY.value = event.clientY
  startHeight.value = inputHeight.value

  console.log('[TitleBar] Starting drag', { isDragging: isDragging.value, startY: startY.value, startHeight: startHeight.value })

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'ns-resize'
}

function onDrag(event) {
  if (!isDragging.value) {
    console.log('[TitleBar] onDrag called but not dragging')
    return
  }

  const deltaY = event.clientY - startY.value
  const newHeight = startHeight.value + deltaY

  console.log('[TitleBar] onDrag', {
    clientY: event.clientY,
    deltaY,
    startHeight: startHeight.value,
    newHeight,
    constrainedHeight: Math.max(40, Math.min(newHeight, 400))
  })

  // Constrain height (min 40px, max 400px)
  inputHeight.value = Math.max(40, Math.min(newHeight, 400))
}

function stopDrag() {
  console.log('[TitleBar] stopDrag called', { finalHeight: inputHeight.value })
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
}
</script>

<style scoped>
.title-bar {
  width: 100%;
  -webkit-app-region: drag;
  user-select: none;
  /* border-bottom: 1px solid white;  Removed static border */
  transition: height 0.2s;
}

.window-controls {
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
}

.control-btn.close {
  background-color: #ff5f56;
}

.control-btn.minimize {
  background-color: #ffbd2e;
}

.control-btn.maximize {
  background-color: #27c93f;
}

.control-btn:hover::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(0, 0, 0, 0.5);
  font-size: 8px;
  font-weight: bold;
  font-family: sans-serif;
}

.control-btn.close:hover::after {
  content: 'x';
}

.control-btn.minimize:hover::after {
  content: '-';
  top: 55%;
}

.control-btn.maximize:hover::after {
  content: '+';
}

.title-input-wrapper {
  -webkit-app-region: no-drag;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 40px;
  max-height: 400px;
}

/* Make the input fill the container */
:deep(.title-input) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.title-input .q-field__inner) {
  height: 100%;
}

:deep(.title-input .q-field__control) {
  height: 100%;
}

:deep(.title-input textarea) {
  height: 100% !important;
  resize: none;
}

/* Custom scrollbar for the input area */
.title-input-wrapper::-webkit-scrollbar {
  width: 6px;
}

.title-input-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.title-input-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.title-input-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.resize-handle {
  height: 8px;
  background: rgba(255, 255, 255, 0.15);
  cursor: ns-resize;
  -webkit-app-region: no-drag;
  border-bottom: 2px solid rgba(255, 255, 255, 0.4);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: rgba(255, 255, 255, 0.25);
  border-bottom-color: rgba(255, 255, 255, 0.7);
}

/* Custom styling for q-input to match the look */
:deep(.title-input .q-field__control) {
  background: transparent;
  /* Removed background to blend better or use rgba(255, 255, 255, 0.05) */
  border-radius: 4px;
  padding: 0;
  /* Remove padding to align with edge if needed, or keep small */
}

:deep(.title-input .q-field__control:before),
:deep(.title-input .q-field__control:after) {
  display: none;
  /* Remove underline/border */
}

:deep(.title-input.q-field--focused .q-field__control) {
  background: transparent;
  /* Remove glow/background change on focus */
  box-shadow: none;
  /* Ensure no shadow */
}
</style>
