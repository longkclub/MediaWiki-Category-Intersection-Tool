/**
 * Module for calculating category intersections.
 */
const IntersectionFinder = {
    worker: null,
    isWorkerSupported: typeof Worker !== 'undefined',

    initWorker() {
        if (!this.worker && this.isWorkerSupported) {
            try {
                this.worker = new Worker('js/intersection-worker.js');
            } catch (e) {
                console.warn('Web Worker not supported, using main thread calculation');
                this.isWorkerSupported = false;
            }
        }
        return this.worker;
    },

    /**
     * Finds the intersection of multiple arrays of page objects.
     * Each page object is expected to have a 'pageid' property.
     * @param {Array<Array<Object>>} pageLists - An array of arrays, where each inner array contains page objects from a category.
     * @returns {Array<Object>} - An array of page objects that are present in all input lists.
     */
    findIntersection: (pageLists) => {
        if (!pageLists || pageLists.length === 0) {
            return [];
        }
        if (pageLists.length === 1) {
            return [...pageLists[0]];
        }

        const totalPages = pageLists.reduce((sum, list) => sum + list.length, 0);
        const USE_WORKER_THRESHOLD = 5000;

        if (totalPages > USE_WORKER_THRESHOLD && IntersectionFinder.isWorkerSupported) {
            return IntersectionFinder.findIntersectionWithWorker(pageLists);
        }

        pageLists.sort((a, b) => a.length - b.length);

        const baseList = pageLists[0];
        const otherLists = pageLists.slice(1);

        const pageIdSets = otherLists.map(list => new Set(list.map(page => page.pageid)));

        const intersection = baseList.filter(page => {
            return pageIdSets.every(idSet => idSet.has(page.pageid));
        });

        return intersection;
    },

    findIntersectionWithWorker(pageLists) {
        const worker = IntersectionFinder.initWorker();
        if (!worker) {
            return IntersectionFinder.findIntersection(pageLists);
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Worker timeout'));
            }, 120000);

            worker.onmessage = (e) => {
                if (e.data.type === 'progress') {
                    return;
                }
                clearTimeout(timeoutId);
                if (e.data.success) {
                    const intersectingPageIds = new Set(e.data.result);
                    const result = pageLists[0].filter(page => intersectingPageIds.has(page.pageid));
                    resolve(result);
                } else {
                    reject(new Error(e.data.error));
                }
            };

            worker.onerror = (error) => {
                clearTimeout(timeoutId);
                console.error('Worker error:', error);
                IntersectionFinder.isWorkerSupported = false;
                resolve(IntersectionFinder.findIntersection(pageLists));
            };

            worker.postMessage({
                type: 'findIntersection',
                pageLists: pageLists.map(list => list.map(p => ({ pageid: p.pageid })))
            });
        });
    },

    /**
     * Fetches pages for selected categories and then finds their intersection.
     * @param {MediaWikiAPI} apiHandler - Instance of MediaWikiAPI.
     * @param {Array<string>} selectedCategoryNames - Array of category names.
     * @param {Function} progressCallback - Function to update progress (type, message, current, total).
     *        Types: 'category', 'calculation', 'done', 'error'
     * @returns {Promise<Array<Object>>} - Promise resolving to an array of intersecting page objects.
     */
    fetchAndIntersect: async (apiHandler, selectedCategoryNames, progressCallback) => {
        if (selectedCategoryNames.length === 0) {
            progressCallback('done', _('noCategoriesSelected'), 0, 0);
            return [];
        }

        const allCategoryPageLists = [];
        let totalCategories = selectedCategoryNames.length;
        let categoriesProcessed = 0;

        for (const categoryName of selectedCategoryNames) {
            categoriesProcessed++;
            progressCallback(
                'category',
                _('progressStatusFetchingCategory', categoryName),
                categoriesProcessed,
                totalCategories
            );
            try {
                const pages = await apiHandler.fetchPagesInCategory(categoryName, (fetched, total) => {
                });
                allCategoryPageLists.push(pages);
            } catch (error) {
                progressCallback('error', _('fetchError', `${categoryName}: ${error.message}`), categoriesProcessed, totalCategories);
                throw error;
            }
        }

        progressCallback('calculation', _('progressStatusCalculating'), totalCategories, totalCategories);
        await new Promise(resolve => setTimeout(resolve, 50));

        const intersectingPages = await IntersectionFinder.findIntersection(allCategoryPageLists);

        progressCallback('done', _('progressStatusDone'), totalCategories, totalCategories);
        return intersectingPages;
    }
};
