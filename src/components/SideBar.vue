<script setup>
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';

const data = useDataStore();
const ui = useUiStore();

// 切视图属于偏好，走增量 PATCH（600ms 防抖）
function selectView(id) {
  data.settings.view = id;
  data.patchSettings();
}

function openCategoryEditor(category) {
  ui.editingCategory = category || null;
  ui.categoryEditorOpen = true;
}
</script>

<template>
  <aside class="sidebar">
    <div class="side-block">
      <h2 class="side-title"><span>视图</span></h2>
      <ul class="cat-list">
        <li v-for="v in data.views" :key="v.id">
          <button
            type="button"
            class="cat-item"
            :aria-current="String(data.settings.view === v.id)"
            @click="selectView(v.id)"
          >
            <span class="cat-dot" :style="{ '--c': v.color }"></span>
            <span class="cat-name">{{ v.name }}</span>
            <span class="cat-count">{{ v.count }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="side-block side-block--cats">
      <h2 class="side-title">
        <span>分类</span>
        <button class="mini-btn" type="button" @click="openCategoryEditor(null)">+ 新建</button>
      </h2>
      <ul class="cat-list">
        <li v-if="!data.categories.length">
          <p class="side-hint" style="padding: 2px 8px">还没有分类</p>
        </li>
        <li v-for="c in data.categories" :key="c.id">
          <div
            class="cat-item"
            role="button"
            tabindex="0"
            :aria-current="String(data.settings.view === c.id)"
            @click="selectView(c.id)"
            @keydown.enter.prevent="selectView(c.id)"
            @keydown.space.prevent="selectView(c.id)"
          >
            <span class="cat-dot" :style="{ '--c': c.color }"></span>
            <span class="cat-name">{{ c.name }}</span>
            <span class="cat-count">{{ data.categoryCounts[c.id] || 0 }}</span>
            <span class="cat-tools">
              <button type="button" class="cat-tool" title="编辑分类" @click.stop="openCategoryEditor(c)">✎</button>
              <button type="button" class="cat-tool" title="删除分类" @click.stop="openCategoryEditor(c)">×</button>
            </span>
          </div>
        </li>
      </ul>
    </div>

    <div class="side-foot">
      <p>{{ data.statsLine }}</p>
      <p class="side-hint">数据保存在服务器上</p>
    </div>
  </aside>
</template>
