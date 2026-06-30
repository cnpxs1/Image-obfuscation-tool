// 图片混淆工具 — 统一存储抽象层 (Cache API 优先 → IndexedDB 回退)
// =============================================
// 统一存储抽象层 (StorageAdapter)
// =============================================

    /**
     * 根据用户偏好与当前环境选择存储后端
     * - Auto: 优先 Cache API，不可用时降级 IndexedDB
     * - Cache API / IndexedDB: 按用户指定，不可用时自动切换
     */
    class StorageAdapter {
        constructor() {
            this.backend = null;
            this.dbName = 'ImageObfuscationDB';
            this.storeName = 'imageBlobs';
            this.db = null;
            this.cacheName = 'image-obfuscation-cache-v1';
            /** @type {'auto'|'cache-api'|'indexeddb'} 用户偏好的后端 */
            this.preference = 'auto';
            /** @type {string} 实际使用的后端名称 */
            this.activeBackend = '';
            this.ready = this._init();
        }

        async _init() {
            // 读取用户偏好（直接读 localStorage，避免依赖尚未定义的 loadSetting）
            let saved = null;
            try { saved = localStorage.getItem('cacheBackend'); } catch (e) { /* 忽略 */ }
            this.preference = (saved === 'cache-api' || saved === 'indexeddb') ? saved : 'auto';

            // 预检测各后端可用性
            const cacheApiSupported = typeof window.caches !== 'undefined' && location.protocol !== 'file:';
            const indexedDbSupported = typeof window.indexedDB !== 'undefined';

            // 根据偏好与可用性决定使用哪个后端
            let tryCacheApi = (this.preference === 'cache-api' || this.preference === 'auto') && cacheApiSupported;
            let tryIndexedDb = (this.preference === 'indexeddb' || this.preference === 'auto') && indexedDbSupported;

            // 记录后端实际可用性（用于下拉菜单灰显）
            window.__cacheBackendAvail = {
                cacheApi: cacheApiSupported,
                indexedDb: indexedDbSupported
            };

            // 如果首选不可用，强制走另一方
            if (this.preference === 'cache-api' && !cacheApiSupported) {
                tryCacheApi = false;
                tryIndexedDb = indexedDbSupported;
                logInfo('存储适配层', 'Cache API 不可用，自动切换至 IndexedDB');
            }
            if (this.preference === 'indexeddb' && !indexedDbSupported) {
                tryIndexedDb = false;
                tryCacheApi = cacheApiSupported;
                logWarn('存储适配层', 'IndexedDB 不可用，自动切换至 Cache API');
            }

            // 尝试 Cache API
            if (tryCacheApi) {
                try {
                    await caches.delete(this.cacheName);
                    this.backend = await caches.open(this.cacheName);
                    this.activeBackend = 'cache-api';
                    logLog('使用 Cache API');
                    logLog('已清理旧数据');
                    setTimeout(() => {
                        updateCacheIndicator('Cache API');
                        updateCacheSelectOptions();
                    }, 100);
                    return;
                } catch (e) {
                    logInfo('存储适配层', `Cache API 不可用，降级到 IndexedDB: ${e.message || e}`);
                    window.__cacheBackendAvail.cacheApi = false;
                }
            }

            // 尝试 IndexedDB
            if (tryIndexedDb) {
                try {
                    await this._initIndexedDB();
                    await this._dbTransaction('readwrite', store => store.clear());
                    this.activeBackend = 'indexeddb';
                    logLog('使用 IndexedDB');
                    logLog('已清理旧数据');
                    setTimeout(() => {
                        updateCacheIndicator('IndexedDB');
                        updateCacheSelectOptions();
                    }, 100);
                    return;
                } catch (e) {
                    logWarn('存储适配层', `IndexedDB 不可用: ${e.message || e}`);
                    window.__cacheBackendAvail.indexedDb = false;
                }
            }

            // 两个都不可用（极端情况）
            this.activeBackend = 'none';
            logWarn('存储适配层', '所有存储后端均不可用，图片处理将无法缓存');
            setTimeout(() => updateCacheSelectOptions(), 100);
        }

        /**
         * 运行时切换存储后端（立即生效，无需刷新页面）
         * 切换时会自动迁移旧后端的所有缓存数据到新后端，避免数据丢失
         * @param {'auto'|'cache-api'|'indexeddb'} newPreference
         */
        async reinit(newPreference) {
            // 自旋锁：等待上一次 reinit 完成，防止并发调用导致数据迁移竞争
            if (this._reinitializing) {
                try { await this._reinitializing; } catch (e) { /* 前次切换失败，继续尝试 */ }
            }
            let _resolveReinitializing;
            this._reinitializing = new Promise(function(resolve) { _resolveReinitializing = resolve; });

            try {
                // 先等待当前正在进行的初始化完成，避免与首次 _init 并发
                try { await this.ready; } catch (e) { /* 初始化失败也继续走重置流程 */ }

                this.preference = newPreference;

                // 解析 auto → 实际后端，同一后端无需迁移
                const effective = newPreference === 'auto'
                    ? (window.__cacheBackendAvail?.cacheApi ? 'cache-api' : (window.__cacheBackendAvail?.indexedDb ? 'indexeddb' : ''))
                    : newPreference;
                if (effective && effective === this.activeBackend) return;

                // 读取旧后端所有数据
                const oldData = new Map();
                try {
                    if (this.activeBackend === 'cache-api' && this.backend) {
                        const keys = await this.backend.keys();
                        for (const request of keys) {
                            try {
                                const key = (typeof request === 'string' ? request : request.url).split('/').pop();
                                const res = await this.backend.match(request);
                                if (res) oldData.set(key, await res.blob());
                            } catch (e) { /* 跳过单条失败 */ }
                        }
                    } else if (this.activeBackend === 'indexeddb' && this.db) {
                        await new Promise((resolve, reject) => {
                            const tx = this.db.transaction([this.storeName], 'readonly');
                            const s = tx.objectStore(this.storeName);
                            Promise.all([
                                new Promise(r => { const req = s.getAllKeys(); req.onsuccess = () => r(req.result); req.onerror = () => r([]); }),
                                new Promise(r => { const req = s.getAll(); req.onsuccess = () => r(req.result); req.onerror = () => r([]); })
                            ]).then(([keys, values]) => {
                                keys.forEach((k, i) => { if (values[i] !== undefined) oldData.set(k, values[i]); });
                                resolve();
                            }).catch(() => resolve());
                            tx.onerror = () => reject(tx.error);
                        });
                    }
                } catch (e) { /* 读取失败降级为空迁移 */ }

                // 清空旧后端
                try {
                    if (this.activeBackend === 'cache-api' && this.backend) {
                        const keys = await this.backend.keys();
                        await Promise.all(keys.map(k => this.backend.delete(k)));
                        logLog(`已清除旧后端 Cache API 的 ${keys.length} 条数据`);
                    } else if (this.activeBackend === 'indexeddb' && this.db) {
                        await this._dbTransaction('readwrite', store => store.clear());
                        logLog('已清除旧后端 IndexedDB 的数据');
                    }
                } catch (e) { /* 清理失败不影响切换 */ }

                // 初始化新后端（先清旧再建新：旧后端数据已安全快照至 oldData）
                this.backend = null;
                this.db = null;
                this.activeBackend = '';
                this.ready = this._init();
                await this.ready;

                // 验证新后端已就绪：若 _init 全部失败，迁移数据将无处写入
                if (!this.backend && !this.db && oldData.size > 0) {
                    const targetLabel = newPreference === 'auto'
                        ? '自动选择（Cache API / IndexedDB 均不可用）'
                        : (newPreference === 'cache-api' ? 'Cache API' : 'IndexedDB');
                    logError('存储适配层',
                        `切换至 ${targetLabel} 失败，${oldData.size} 条缓存数据丢失`);
                }

                // 迁移数据到新后端：按 activeBackend 显式分派，避免依赖 this.backend 的隐式真假
                if (oldData.size > 0) {
                    const writeToCacheApi = this.activeBackend === 'cache-api' && this.backend;
                    const writeToIndexedDb = this.activeBackend === 'indexeddb' && this.db;
                    let migrated = 0, failed = 0;
                    for (const [key, blob] of oldData) {
                        if (writeToCacheApi) {
                            try {
                                const res = new Response(blob, {
                                    headers: { 'Content-Type': blob.type || 'image/png' }
                                });
                                await this.backend.put(key, res);
                                migrated++;
                            } catch (e) { failed++; }
                        } else if (writeToIndexedDb) {
                            try {
                                await this._dbTransaction('readwrite', store => store.put(blob, key));
                                migrated++;
                            } catch (e) { failed++; }
                        } else {
                            // 无可用后端：逐条记录失败
                            failed++;
                        }
                    }
                    if (migrated > 0) {
                        logLog(`已迁移 ${migrated} 条缓存数据${failed > 0 ? `，${failed} 条失败` : ''}`);
                    } else if (failed > 0) {
                        logError('存储适配层', `数据迁移全部失败：${oldData.size} 条数据无法写入新后端`);
                    }
                }

                // 刷新缩略图
                if (images.length > 0) await refreshAllThumbnails();
            } finally {
                _resolveReinitializing();
                this._reinitializing = null;
            }
        }

        async _initIndexedDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };
            });
        }

        async set(key, blob) {
            await this.ready;
            try {
                if (this.backend) {
                    const response = new Response(blob, {
                        headers: { 'Content-Type': blob.type || 'image/png' }
                    });
                    await this.backend.put(key, response);
                } else {
                    await this._dbTransaction('readwrite', store => store.put(blob, key));
                }
            } catch (err) {
                const name = (err && err.name) || '';
                if (name === 'QuotaExceededError') {
                    const quotaErr = new Error('存储空间已满，请清理部分图片后重试');
                    quotaErr.type = 'quota';
                    throw quotaErr;
                }
                const storageErr = new Error(`存储写入失败: ${err.message || err}`);
                storageErr.type = 'storage';
                storageErr.cause = err;
                throw storageErr;
            }
        }

        /** @returns {Promise<Blob|null>} */
        async get(key) {
            await this.ready;
            if (this.backend) {
                const response = await this.backend.match(key);
                if (!response) return null;
                return response.blob();
            } else {
                return this._dbTransaction('readonly', store => store.get(key));
            }
        }

        async delete(key) {
            await this.ready;
            if (this.backend) {
                await this.backend.delete(key);
            } else {
                return this._dbTransaction('readwrite', store => store.delete(key));
            }
        }

        async clear() {
            await this.ready;
            if (this.backend) {
                try {
                    await caches.delete(this.cacheName);
                    this.backend = await caches.open(this.cacheName);
                } catch (e) {
                    logWarn('存储适配层', `Cache API 重建失败: ${e.message || e}`);
                    this.backend = null;
                    // 尝试回退到 IndexedDB，避免存储功能整体瘫痪
                    try {
                        await this._initIndexedDB();
                        this.activeBackend = 'indexeddb';
                        await this._dbTransaction('readwrite', store => store.clear());
                        logLog('Cache API 重建失败，已回退到 IndexedDB 并完成清理');
                    } catch (e2) {
                        logWarn('存储适配层', `IndexedDB 回退也失败: ${e2.message || e2}`);
                        this.activeBackend = 'none';
                    }
                }
            } else if (this.db) {
                return this._dbTransaction('readwrite', store => store.clear());
            } else {
                logWarn('存储适配层', '所有后端均不可用，无法执行清理操作');
            }
        }

        /** IndexedDB 事务 Promise 封装，消除重复的事务样板代码 */
        _dbTransaction(mode, operationFn) {
            if (!this.db) {
                throw new Error('IndexedDB 未初始化，存储操作不可用');
            }
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], mode);
                const store = transaction.objectStore(this.storeName);
                const request = operationFn(store);
                transaction.onerror = () => reject(transaction.error);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        }

        /** 删除指定图片的所有关联数据（原始、当前、缩略图） */
        async deleteImageData(id) {
            if (this.backend) {
                // Cache API：三路并发删除安全
                await Promise.all([
                    this.delete(`original_${id}`),
                    this.delete(`current_${id}`),
                    this.delete(`thumb_${id}`)
                ]);
            } else if (this.db) {
                // IndexedDB：合并在单事务中执行，避免并发事务冲突
                // _dbTransaction 依赖返回值绑定 onerror/onsuccess，故 return 最后一个 delete 的请求
                await this._dbTransaction('readwrite', store => {
                    store.delete(`original_${id}`);
                    store.delete(`current_${id}`);
                    return store.delete(`thumb_${id}`);
                });
            } else {
                logWarn('Storage', `删除图片 ${id} 时无可用后端，可能产生缓存残留`);
            }
        }
    }
