/**
 * Web Worker for calculating category intersections
 * Runs in a separate thread to avoid blocking the main UI
 */

self.onmessage = function(e) {
    const { pageLists, type } = e.data;

    if (type === 'findIntersection') {
        try {
            const result = findIntersectionOptimized(pageLists);
            self.postMessage({ success: true, result });
        } catch (error) {
            self.postMessage({ success: false, error: error.message });
        }
    }
};

function findIntersectionOptimized(pageLists) {
    if (!pageLists || pageLists.length === 0) {
        return [];
    }
    if (pageLists.length === 1) {
        return pageLists[0].map(page => page.pageid);
    }

    pageLists.sort((a, b) => a.length - b.length);

    const baseList = pageLists[0];
    const otherLists = pageLists.slice(1);

    const pageIdSets = otherLists.map(list => {
        const set = new Set();
        for (let i = 0; i < list.length; i++) {
            set.add(list[i].pageid);
        }
        return set;
    });

    const intersection = [];
    const batchSize = 1000;

    for (let i = 0; i < baseList.length; i++) {
        const page = baseList[i];
        let isInAll = true;
        for (let j = 0; j < pageIdSets.length; j++) {
            if (!pageIdSets[j].has(page.pageid)) {
                isInAll = false;
                break;
            }
        }
        if (isInAll) {
            intersection.push(page.pageid);
        }

        if (i % batchSize === 0 && i > 0) {
            self.postMessage({
                type: 'progress',
                processed: i,
                total: baseList.length,
                found: intersection.length
            });
        }
    }

    return intersection;
}
