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
                logInfo(t('log.category.storage'), t('log.msg.cacheApiUnavailable'));
            }
            if (this.preference === 'indexeddb' && !indexedDbSupported) {
                tryIndexedDb = false;
                tryCacheApi = cacheApiSupported;
                logWarn(t('log.category.storage'), t('log.msg.indexedDbUnavailable'));
            }

            // 尝试 Cache API
            if (tryCacheApi) {
                try {
                    await caches.delete(this.cacheName);
                    this.backend = await caches.open(this.cacheName);
                    this.activeBackend = 'cache-api';
                    logLog(t('log.msg.usingCacheApi'));
                    logLog(t('log.msg.clearedOldData'));
                    setTimeout(() => {
                        updateCacheIndicator('Cache API');
                        updateCacheSelectOptions();
                    }, 100);
                    return;
                } catch (e) {
                    logInfo(t('log.category.storage'), t('log.msg.cacheApiDegraded', { msg: e.message || e }));
                    window.__cacheBackendAvail.cacheApi = false;
                }
            }

            // 尝试 IndexedDB
            if (tryIndexedDb) {
                try {
                    await this._initIndexedDB();
                    await this._dbTransaction('readwrite', store => store.clear());
                    this.activeBackend = 'indexeddb';
                    logLog(t('log.msg.usingIndexedDb'));
                    logLog(t('log.msg.clearedOldData'));
                    setTimeout(() => {
                        updateCacheIndicator('IndexedDB');
                        updateCacheSelectOptions();
                    }, 100);
                    return;
                } catch (e) {
                    logWarn(t('log.category.storage'), t('log.msg.indexedDbFailed', { msg: e.message || e }));
                    window.__cacheBackendAvail.indexedDb = false;
                }
            }

            // 两个都不可用（极端情况）
            this.activeBackend = 'none';
            logWarn(t('log.category.storage'), t('log.msg.allBackendsUnavailable'));
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
                        logLog(t('log.msg.clearedOldCacheApi', { n: keys.length }));
                    } else if (this.activeBackend === 'indexeddb' && this.db) {
                        await this._dbTransaction('readwrite', store => store.clear());
                        logLog(t('log.msg.clearedOldIndexedDb'));
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
                        ? t('storage.switchTargetAuto')
                        : (newPreference === 'cache-api' ? t('storage.cacheApi') : t('storage.indexeddb'));
                    logError(t('log.category.storage'),
                        t('log.msg.switchFailedDataLost', { target: targetLabel, n: oldData.size }));
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
                        const extra = failed > 0 ? t('log.msg.migratedFailedPart', { n: failed }) : '';
                        logLog(t('log.msg.migrated', { n: migrated, extra: extra }));
                    } else if (failed > 0) {
                        logError(t('log.category.storage'), t('log.msg.migrationAllFailed', { n: oldData.size }));
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
                    const quotaErr = new Error(t('error.quotaExceeded'));
                    quotaErr.type = 'quota';
                    throw quotaErr;
                }
                const storageErr = new Error(t('error.storageWriteFailed', { msg: err.message || err }));
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
                    logWarn(t('log.category.storage'), t('log.msg.cacheApiRecreateFailed', { msg: e.message || e }));
                    this.backend = null;
                    // 尝试回退到 IndexedDB，避免存储功能整体瘫痪
                    try {
                        await this._initIndexedDB();
                        this.activeBackend = 'indexeddb';
                        await this._dbTransaction('readwrite', store => store.clear());
                        logLog(t('log.msg.cacheApiRebuildFellBack'));
                    } catch (e2) {
                        logWarn(t('log.category.storage'), t('log.msg.indexedDbFallbackFailed', { msg: e2.message || e2 }));
                        this.activeBackend = 'none';
                    }
                }
            } else if (this.db) {
                return this._dbTransaction('readwrite', store => store.clear());
            } else {
                logWarn(t('log.category.storage'), t('log.msg.clearNoBackend'));
            }
        }

        /** IndexedDB 事务 Promise 封装，消除重复的事务样板代码 */
        _dbTransaction(mode, operationFn) {
            if (!this.db) {
                throw new Error(t('error.indexedDbNotInit'));
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
                logWarn(t('log.category.storage2'), t('log.msg.deleteNoBackend', { id: id }));
            }
        }
    }
