// 图片混淆工具 — 希尔伯特空间填充曲线算法
// =============================================
// 希尔伯特曲线算法
// =============================================

    /**
     * 生成二维希尔伯特曲线坐标序列
     * @param {number} width - 图片宽度
     * @param {number} height - 图片高度
     * @returns {Array} 坐标数组，每个元素为[x, y]
     *
     * 希尔伯特曲线是一种空间填充曲线，能够保持像素的空间相关性
     * 通过黄金分割比例计算偏移量实现混淆效果
     */
    // 希尔伯特曲线缓存 — LFU-Aging 策略（新条目以平均频率起步 + 周期性老化）
    const curveCache = new Map();
    const MAX_CACHE_SIZE = 20;
    let accessCounter = 0, cacheHits = 0, cacheMisses = 0, cacheEvictions = 0;

    function logCacheStats() {
        const q = cacheHits + cacheMisses, s = curveCache.size;
        if (!q) return;
        const f = [...curveCache.values()].map(e => e.frequency);
        logLog(t('log.msg.curveCacheStats', { hitRate: (cacheHits/q*100).toFixed(1), hits: cacheHits, q: q, size: s, max: MAX_CACHE_SIZE, minF: s?Math.min(...f):0, maxF: s?Math.max(...f):0, evictions: cacheEvictions, access: accessCounter }));
    }

    /**
     * 获取指定尺寸的 gather 映射表（带 LFU-Aging 缓存）
     *
     * 混淆/解混淆统一改写为 gather 形式：dst[j] = src[gather[j]]
     * 生成时直接遍历曲线（j = curve[i]）一步写出两张表：
     * - encrypt：gatherEncrypt[curve[i]] = curve[(i - offset + total) % total]
     * - decrypt：gatherDecrypt[curve[i]] = curve[(i + offset) % total]
     *
     * 与 scatter 形式 dst[to[i]] = src[from[i]] 完全等价，但跨线程只需传输一张表，
     * 且目标写入变为顺序访问。
     *
     * @param {number} width
     * @param {number} height
     * @returns {{gatherEncrypt: Uint32Array, gatherDecrypt: Uint32Array}}
     */
    function getCachedCurve(width, height) {
        const key = `${width}x${height}`;
        accessCounter++;
        const isLog = logLevel === 'log',
            shouldLog = isLog && accessCounter % (MAX_CACHE_SIZE * 2) === 0;
        if (curveCache.has(key)) {
            cacheHits++;
            const entry = curveCache.get(key);
            entry.frequency++;
            entry.lastAccess = accessCounter;
            if (shouldLog) logCacheStats();
            return entry.data;
        }
        cacheMisses++;
        const total = width * height,
            curve = hilbert2D(width, height),
            offset = Math.round((Math.sqrt(5) - 1) / 2 * total),
            gatherEncrypt = new Uint32Array(total),
            gatherDecrypt = new Uint32Array(total);

        // 直接由曲线生成两张 gather 表，省去逆曲线中间数组与一次完整遍历：
        // 对曲线位置 i，令 j = curve[i]，则
        //   gatherDecrypt[j] = curve[(i + offset) % total]
        //   gatherEncrypt[j] = curve[(i - offset + total) % total]
        // offset 取值范围为 [0, total]，因此单次加减即可完成取模
        for (let i = 0; i < total; i++) {
            const j = curve[i];
            let kDec = i + offset;
            if (kDec >= total) kDec -= total;
            gatherDecrypt[j] = curve[kDec];
            let kEnc = i - offset;
            if (kEnc < 0) kEnc += total;
            gatherEncrypt[j] = curve[kEnc];
        }

        if (curveCache.size >= MAX_CACHE_SIZE) {
            let m = Infinity, o = Infinity, v = null;
            for (const [k, e] of curveCache) {
                e.frequency >>= 1;  // 老化
                if (e.frequency < m || (e.frequency === m && e.lastAccess < o))
                    { m = e.frequency; o = e.lastAccess; v = k; }
            }
            v !== null && curveCache.delete(v);
            cacheEvictions++;
        }
        let s = 0;
        for (const e of curveCache.values()) s += e.frequency;
        const n = curveCache.size;
        curveCache.set(key, { data: { gatherEncrypt, gatherDecrypt }, frequency: n ? Math.max(1, Math.ceil(s / n)) : 1, lastAccess: accessCounter });
        if (shouldLog) logCacheStats();
        return { gatherEncrypt, gatherDecrypt };
    }

    /**
     * 生成二维希尔伯特曲线遍历顺序的像素索引数组
     * @param {number} width  - 图像宽度
     * @param {number} height - 图像高度
     * @returns {Uint32Array} 按曲线顺序排列的像素线性索引
     */
    function hilbert2D(width, height) {
        const w = width;
        const total = width * height;
        const order = new Uint32Array(total);
        let idx = 0;

        // 预分配 Array 栈：初始容量用 +8 安全系数，配合动态扩容消除溢出风险
        // 使用普 Array 替代 Int32Array，保留索引赋值性能，同时支持 stack.length 动态扩容
        const initialDepth = Math.ceil(Math.log2(Math.max(width, height))) * 2 + 8;
        const stack = new Array(initialDepth * 6);
        let sp;

        // 初始方向向量：dx1/dy1 和 dx2/dy2 各有一维为零
        if (width >= height) {
            stack[0] = 0; stack[1] = 0;
            stack[2] = width; stack[3] = 0;
            stack[4] = 0; stack[5] = height;
        } else {
            stack[0] = 0; stack[1] = 0;
            stack[2] = 0; stack[3] = height;
            stack[4] = width; stack[5] = 0;
        }
        sp = 6;

        while (sp > 0) {
            sp -= 6;
            const x0  = stack[sp];
            const y0  = stack[sp + 1];
            const dx1 = stack[sp + 2];
            const dy1 = stack[sp + 3];
            const dx2 = stack[sp + 4];
            const dy2 = stack[sp + 5];

            // 方向向量各有一维为零，求和取绝对值即得单元尺寸（无分支）
            const cellW = Math.abs(dx1 + dy1);
            const cellH = Math.abs(dx2 + dy2);
            // (v>0)-(v<0) 等价于 Math.sign 但无函数调用开销
            const sX1 = (dx1 > 0) - (dx1 < 0);
            const sY1 = (dy1 > 0) - (dy1 < 0);
            const sX2 = (dx2 > 0) - (dx2 < 0);
            const sY2 = (dy2 > 0) - (dy2 < 0);

            if (cellH === 1) {
                const step = sX1 + sY1 * w;
                let ptr = y0 * w + x0;
                const end = idx + cellW;
                while (idx < end) {
                    order[idx++] = ptr;
                    ptr += step;
                }
                continue;
            }

            if (cellW === 1) {
                const step = sX2 + sY2 * w;
                let ptr = y0 * w + x0;
                const end = idx + cellH;
                while (idx < end) {
                    order[idx++] = ptr;
                    ptr += step;
                }
                continue;
            }

            let hX1 = dx1 >> 1;
            let hY1 = dy1 >> 1;
            let hX2 = dx2 >> 1;
            let hY2 = dy2 >> 1;
            const halfW = Math.abs(hX1 + hY1);
            const halfH = Math.abs(hX2 + hY2);

            if (2 * cellW > 3 * cellH) {
                if ((halfW & 1) && cellW > 2) {
                    hX1 += sX1;
                    hY1 += sY1;
                }

                if (sp + 12 > stack.length) stack.length += 64;
                stack[sp]     = x0 + hX1;
                stack[sp + 1] = y0 + hY1;
                stack[sp + 2] = dx1 - hX1;
                stack[sp + 3] = dy1 - hY1;
                stack[sp + 4] = dx2;
                stack[sp + 5] = dy2;
                sp += 6;

                stack[sp]     = x0;
                stack[sp + 1] = y0;
                stack[sp + 2] = hX1;
                stack[sp + 3] = hY1;
                stack[sp + 4] = dx2;
                stack[sp + 5] = dy2;
                sp += 6;
            } else {
                if ((halfH & 1) && cellH > 2) {
                    hX2 += sX2;
                    hY2 += sY2;
                }

                if (sp + 18 > stack.length) stack.length += 64;
                stack[sp]     = x0 + (dx1 - sX1) + (hX2 - sX2);
                stack[sp + 1] = y0 + (dy1 - sY1) + (hY2 - sY2);
                stack[sp + 2] = -hX2;
                stack[sp + 3] = -hY2;
                stack[sp + 4] = -(dx1 - hX1);
                stack[sp + 5] = -(dy1 - hY1);
                sp += 6;

                stack[sp]     = x0 + hX2;
                stack[sp + 1] = y0 + hY2;
                stack[sp + 2] = dx1;
                stack[sp + 3] = dy1;
                stack[sp + 4] = dx2 - hX2;
                stack[sp + 5] = dy2 - hY2;
                sp += 6;

                stack[sp]     = x0;
                stack[sp + 1] = y0;
                stack[sp + 2] = hX2;
                stack[sp + 3] = hY2;
                stack[sp + 4] = hX1;
                stack[sp + 5] = hY1;
                sp += 6;
            }
        }

        return order;
    }
