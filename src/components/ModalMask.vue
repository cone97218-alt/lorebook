<script setup lang="ts">
import { modalHost } from '@/state/ui';

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <Teleport :to="modalHost" :disabled="!modalHost">
    <Transition name="myext-modal">
      <div v-if="open" class="myext-modal-mask" data-tt-mobile-surface="backdrop" @mousedown.self="emit('close')">
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
