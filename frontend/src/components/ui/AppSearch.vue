<template>
  <div class="app-search" :class="{ 'app-search--focused': focused }">
    <AppIcon
      name="search"
      :size="size === 'lg' ? 18 : 15"
      class="app-search__icon"
    />
    <input
      class="app-search__input"
      :class="`app-search__input--${size}`"
      :value="modelValue"
      :placeholder="placeholder"
      type="text"
      :readonly="readonly"
      @input="onInput"
      @focus="focused = true"
      @blur="focused = false"
      @keydown.enter="emit('enter')"
      @keydown.esc="emit('esc')"
    />
    <button
      v-if="kbd && !modelValue"
      class="app-search__kbd"
      type="button"
      tabindex="-1"
      @click="emit('kbd-click')"
    >
      /
    </button>
    <button
      v-else-if="modelValue && !readonly"
      class="app-search__clear"
      type="button"
      tabindex="-1"
      aria-label="清空"
      @click="
        emit('update:modelValue', '');
        emit('enter');
      "
    >
      <AppIcon name="close" :size="13" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * AppSearch —— 项目搜索框语言（Phase UI-R1 §八）
 * 纯受控输入；下拉/面板逻辑由使用方实现（如 CommandPalette）
 */
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    size?: "sm" | "md" | "lg";
    /** 未输入时展示 "/" 快捷键提示 */
    kbd?: boolean;
    /** 只读形态（作为触发器使用） */
    readonly?: boolean;
  }>(),
  { modelValue: "", placeholder: "搜索…", size: "md" }
);

const emit = defineEmits<{
  "update:modelValue": [v: string];
  enter: [];
  esc: [];
  "kbd-click": [];
}>();

const focused = ref(false);

function onInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
}
</script>

<style scoped>
.app-search {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 0 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-border-strong);
  border-radius: var(--radius-md);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.app-search--focused {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 1px var(--app-accent);
}

.app-search__icon {
  flex-shrink: 0;
  color: var(--app-text-faint);
}

.app-search--focused .app-search__icon {
  color: var(--app-text-muted);
}

.app-search__input {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  color: var(--app-text);
  outline: none;
  background: transparent;
  border: none;
}

.app-search__input::placeholder {
  color: var(--app-text-faint);
}

.app-search__input--sm {
  height: 30px;
  font-size: 13px;
}

.app-search__input--md {
  height: 36px;
  font-size: 13.5px;
}

.app-search__input--lg {
  height: 48px;
  font-size: 15px;
}

.app-search__kbd {
  padding: 3px 7px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  color: var(--app-text-faint);
  cursor: pointer;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 4px;
}

.app-search__clear {
  display: inline-flex;
  padding: 4px;
  color: var(--app-text-faint);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
}

.app-search__clear:hover {
  color: var(--app-text-secondary);
}
</style>
