<script setup lang="ts">
import type { Field } from "../domain/forms";
import AppArrow from "./AppArrow.vue";
defineProps<{
  field: Field;
  modelValue: string | number;
  error?: string;
  disabled?: boolean;
  focused?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();
function valueChange(e: any) {
  emit("update:modelValue", String(e.detail.value));
}
</script>
<template>
  <view :id="'field-' + field.key" class="field" :class="{ invalid: !!error }"
    ><text class="field-label"
      >{{ field.label
      }}<text v-if="field.required" class="required">*</text></text
    ><view class="input-box" :class="{ disabled }"
      ><picker
        v-if="field.type === 'select'"
        style="flex: 1; min-width: 0"
        :range="field.options"
        :value="Math.max(0, field.options!.indexOf(String(modelValue)))"
        :disabled="disabled"
        @change="
          emit('update:modelValue', field.options![Number($event.detail.value)])
        "
        ><view class="picker-value"
          ><text :class="{ placeholder: !String(modelValue) }">{{
            String(modelValue) || "请选择"
          }}</text
          ><AppArrow /></view
        ></picker
      ><input
        v-else
        :value="String(modelValue)"
        :placeholder="field.placeholder"
        :type="
          field.type === 'integer'
            ? 'number'
            : field.type === 'decimal'
              ? 'digit'
              : 'text'
        "
        :maxlength="field.max || 30"
        :disabled="disabled"
        :aria-label="field.label"
        :focus="focused"
        @input="valueChange"
      /><text v-if="field.unit" class="unit">{{ field.unit }}</text></view
    ><view v-if="error" class="error-text">{{ error }}</view
    ><view v-else-if="field.hint" class="subtext">{{ field.hint }}</view></view
  >
</template>
