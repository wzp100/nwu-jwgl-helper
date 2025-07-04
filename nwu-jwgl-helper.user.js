// ==UserScript==
// @name         教务系统助手 (成绩导出 & 重修查询)
// @namespace    https://github.com/wzp100/nwu-jwgl-helper
// @version      2.5
// @description  在方正/西北大学教务系统页面添加一个统一的助手按钮。在主页提供功能选择，并内置成绩导出(支持全部学年)和重修查询功能。
// @author       tianji (Modified by Gemini)
// @match        *://*/jwglxt/cjcx/*
// @match        https://jwgl.nwu.edu.cn/jwglxt/xtgl/index_initMenu.html*
// @match        https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmIndex.html*
// @match        https://jwgl.nwu.edu.cn/jwglxt/login/slogin_index.html*
// @icon         https://www.zfsoft.com/img/zf.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @connect      jwgl.nwu.edu.cn
// @license      Apache-2.0
// @updateURL    https://github.com/wzp100/nwu-jwgl-helper/raw/main/nwu-jwgl-helper.user.js
// @downloadURL  https://github.com/wzp100/nwu-jwgl-helper/raw/main/nwu-jwgl-helper.user.js
// ==/UserScript==

(function() {
    'use strict';

    /* ================================================================================= */
    /* ============================ 全局UI与路由逻辑 ============================ */
    /* ================================================================================= */

    const assistant = {
        // --- 核心UI元素 ---
        elements: {
            assistantBtn: null,
            modal: null,
            modalTitle: null,
            modalContent: null,
            closeBtn: null,
        },

        // --- 全局样式 ---
        addGlobalStyles: () => {
            GM_addStyle(`
                #assistant-btn {
                    position: fixed; top: 10px; right: 150px; z-index: 9998;
                    padding: 8px 15px; background-color: #28a745; color: white;
                    border: none; border-radius: 5px; cursor: pointer; font-size: 14px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                }
                #assistant-btn:hover { background-color: #218838; }
                #assistant-modal {
                    position: fixed; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 80%; max-width: 800px; max-height: 80vh;
                    background-color: white; border: 1px solid #ccc;
                    border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 10000; display: none; flex-direction: column;
                }
                .assistant-header {
                    padding: 15px; background-color: #f7f7f7;
                    border-bottom: 1px solid #ddd;
                    display: flex; justify-content: space-between; align-items: center;
                }
                .assistant-header h2 { margin: 0; font-size: 18px; }
                .header-buttons { display: flex; align-items: center; gap: 10px; }
                .assistant-close-btn, .header-back-btn {
                    padding: 5px 10px; border-radius: 4px; cursor: pointer;
                }
                .assistant-close-btn { background-color: #e0e0e0; border: 1px solid #ccc; }
                .header-back-btn { background-color: #6c757d; color: white; border: 1px solid #5a6268; }
                .header-back-btn:hover { background-color: #5a6268; }

                .assistant-content { padding: 20px; overflow-y: auto; flex-grow: 1; }
                /* 功能选择菜单按钮样式 */
                .function-select-container { display: flex; flex-direction: column; gap: 15px; align-items: center; padding: 20px 0; }
                .function-select-btn {
                    width: 60%; padding: 15px; font-size: 16px; border-radius: 8px;
                    border: none; background-color: #28a745; color: white; cursor: pointer;
                    text-align: center; transition: all 0.2s ease;
                }
                .function-select-btn:hover { background-color: #218838; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                /* 查询控制区域统一样式 */
                .query-controls {
                    padding: 15px; display: flex; align-items: center; gap: 15px;
                    border-bottom: 1px solid #eee; margin-bottom: 15px;
                }
                .query-controls label { font-weight: bold; margin-bottom: 0; }
                .query-controls select, .query-controls button {
                    padding: 5px 10px; border-radius: 4px; border: 1px solid #ccc;
                }
                .query-controls button { background-color: #28a745; color: white; cursor: pointer; }
                .query-controls button:hover { background-color: #218838; }
                /* 结果表格样式 */
                .result-table { width: 100%; border-collapse: collapse; table-layout: auto; }
                .result-table th, .result-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                .result-table th { background-color: #f2f2f2; position: relative; }
                .sortable-header { cursor: pointer; user-select: none; }
                .sortable-header:hover { background-color: #e0e0e0; }
                /* [新增] 为课程名称列（第2列）设置换行和左对齐 */
                .result-table td:nth-child(2) {
                    word-wrap: break-word;
                    word-break: break-all;
                    text-align: left;
                    padding-left: 10px;
                }
                .sortable-header::after {
                    content: ''; display: inline-block; margin-left: 5px; opacity: 0.5;
                    width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent;
                }
                .sort-asc::after { border-bottom: 5px solid #333; opacity: 1; }
                .sort-desc::after { border-top: 5px solid #333; opacity: 1; }
                #loading-spinner {
                     border: 5px solid #f3f3f3; border-top: 5px solid #28a745;
                     border-radius: 50%; width: 40px; height: 40px;
                     animation: spin 1s linear infinite; margin: 20px auto;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `);
        },

        // --- 创建基础UI框架 ---
        setupUI: () => {
            assistant.addGlobalStyles();
            assistant.elements.assistantBtn = $('<button>', { id: 'assistant-btn', text: '教务助手' }).appendTo('body');
            const modalHTML = `
                <div id="assistant-modal">
                    <div class="assistant-header">
                        <h2 id="assistant-modal-title">教务助手</h2>
                        <div class="header-buttons">
                            <button class="assistant-close-btn">关闭</button>
                        </div>
                    </div>
                    <div id="assistant-modal-content" class="assistant-content"></div>
                </div>`;
            assistant.elements.modal = $(modalHTML).appendTo('body');
            assistant.elements.modalTitle = $('#assistant-modal-title');
            assistant.elements.modalContent = $('#assistant-modal-content');
            assistant.elements.closeBtn = $('.assistant-close-btn');

            assistant.elements.assistantBtn.on('click', assistant.openModal);
            assistant.elements.closeBtn.on('click', assistant.closeModal);
        },

        // --- 打开和关闭模态窗口 ---
        openModal: () => {
            assistant.elements.modal.css('display', 'flex');
            assistant.route();
        },
        closeModal: () => assistant.elements.modal.css('display', 'none'),

        // --- 动态控制返回按钮 ---
        toggleBackButton: (show) => {
            const container = $('.header-buttons');
            container.find('.header-back-btn').remove();
            if (show) {
                const backBtn = $('<button>', { text: '返回', class: 'header-back-btn' });
                backBtn.on('click', assistant.showMainMenu);
                container.prepend(backBtn);
            }
        },

        // --- 主功能选择菜单 ---
        showMainMenu: () => {
            assistant.toggleBackButton(false);
            const content = `
                <div class="function-select-container">
                    <p>请选择您需要使用的功能：</p>
                    <button id="select-grade-export" class="function-select-btn">成绩分项导出</button>
                    <button id="select-retake-query" class="function-select-btn">重修课程查询</button>
                </div>
            `;
            assistant.populateModal('功能选择', content, () => {
                $('#select-grade-export').on('click', gradeExporter.configureModal);
                $('#select-retake-query').on('click', retakeQuerier.configureModal);
            });
        },

        /**
         * 动态填充模态窗口内容
         * @param {string} title - 模态窗口的标题
         * @param {string} contentHTML - 内容区的HTML
         * @param {function} onReady - HTML填充后的回调函数
         * @param {boolean} addAllYearsOption - 是否添加“全部学年”选项
         */
        populateModal: (title, contentHTML, onReady, addAllYearsOption = undefined) => {
            assistant.elements.modalTitle.text(title);
            assistant.elements.modalContent.html(contentHTML);

            if (addAllYearsOption !== undefined) {
                const yearSelect = assistant.elements.modalContent.find('.year-select');
                if (yearSelect.length) {
                    if (addAllYearsOption) {
                        yearSelect.append(new Option('全部学年', ''));
                    }
                    const studentId = assistant.getStudentId();
                    const entryYear = studentId ? parseInt(studentId.substring(0, 4)) : new Date().getFullYear() - 4;
                    const currentYear = new Date().getFullYear();
                    for (let year = entryYear; year <= currentYear; year++) {
                        yearSelect.append(new Option(`${year}-${year + 1}学年`, year));
                    }
                    if (addAllYearsOption) {
                        yearSelect.val('');
                    } else {
                        const defaultYear = (new Date().getMonth() < 8) ? currentYear - 1 : currentYear;
                        yearSelect.val(defaultYear);
                    }
                }
            }

            if (onReady && typeof onReady === 'function') {
                onReady();
            }
        },

        // --- 通用功能 ---
        getStudentId: () => {
            const sessionUserKey_element = document.getElementById('sessionUserKey');
            if (sessionUserKey_element && sessionUserKey_element.value) return sessionUserKey_element.value;
            const xh_id_element = document.getElementById('xh_id');
            if (xh_id_element && xh_id_element.value) return xh_id_element.value;
            try { let studentId = new URLSearchParams(window.top.location.search).get('su'); if (studentId) return studentId; } catch (e) {}
            try { const userElement = window.top.document.querySelector('#sessionUser .media-body span.ng-binding'); if (userElement && userElement.textContent) { const match = userElement.textContent.match(/\d+/); if (match) return match[0]; } } catch (e) {}
            return null;
        },

        // --- 路由与初始化 ---
        route: () => {
            const currentUrl = window.location.href;
            if (/\/jwglxt\/cjcx\//.test(currentUrl)) {
                gradeExporter.configureModal();
            } else {
                assistant.showMainMenu();
            }
        },

        init: () => {
            assistant.setupUI();
        }
    };


    /* ================================================================================= */
    /* =================== 功能一: 成绩分项下载 (支持全部学年) =================== */
    /* ================================================================================= */

    const gradeExporter = {
        configureModal: () => {
            assistant.toggleBackButton(true);
            const content = `
                <div class="query-controls">
                    <label for="grade-year-select">学年:</label>
                    <select id="grade-year-select" class="year-select"></select>
                    <label for="grade-semester-select">学期:</label>
                    <select id="grade-semester-select">
                        <option value="">全部学期</option>
                        <option value="3">第一学期</option>
                        <option value="12">第二学期</option>
                    </select>
                    <button id="start-export-btn">开始导出</button>
                </div>
                <div id="export-status" style="text-align:center; color:#888;">请选择学年学期后点击导出。</div>`;
            assistant.populateModal('成绩分项导出', content, () => {
                $('#start-export-btn').on('click', gradeExporter.handleExport);
            }, true);
        },
        downloadFile: (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        },
        handleExport: async () => {
            const statusDiv = $('#export-status');
            try {
                const xnm = $('#grade-year-select').val();
                const xqm = $('#grade-semester-select').val();
                const yearText = xnm === '' ? '全部学年' : `${xnm}-${parseInt(xnm) + 1}学年`;
                const semesterText = $('#grade-semester-select option:selected').text();
                const fileName = `成绩单-${yearText}-${semesterText}-${Date.now()}.xlsx`;
                statusDiv.html('<div id="loading-spinner"></div><p>正在请求服务器生成文件...</p>');
                const params = new URLSearchParams([
                    ['gnmkdmKey', 'N305005'], ['xnm', xnm], ['xqm', xqm], ['dcclbh', 'JW_N305005_GLY'],
                    ...['kcmc@课程名称', 'xnmmc@学年', 'xqmmc@学期', 'kkbmmc@开课学院', 'kch@课程代码', 'jxbmc@教学班', 'xf@学分', 'xmcj@成绩', 'xmblmc@成绩分项'].map(col => ['exportModel.selectCol', col]),
                    ['exportModel.exportWjgs', 'xls'], ['fileName', '成绩单']
                ]);
                const response = await fetch('/jwglxt/cjcx/cjcx_dcXsKccjList.html', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });
                if (!response.ok) throw new Error(`服务器返回异常: ${response.status}`);
                statusDiv.text('正在下载文件...');
                const blob = await response.blob();
                gradeExporter.downloadFile(blob, fileName);
                statusDiv.html('<p style="color: green;">导出成功！</p>');
            } catch (error) {
                console.error('导出操作失败:', error);
                statusDiv.html(`<p style="color: red;">导出失败: ${error.message}</p>`);
            }
        },
    };


    /* ================================================================================= */
    /* =================== 功能二: 重修查询助手 (按学年查询) =================== */
    /* ================================================================================= */

    const retakeQuerier = {
        currentCourseData: [],
        sortState: { key: 'cj', direction: 'asc' }, // 默认按成绩升序
        configureModal: () => {
            assistant.toggleBackButton(true);
            const content = `
                <div class="query-controls">
                    <label for="retake-year-select">学年:</label>
                    <select id="retake-year-select" class="year-select"></select>
                    <label for="retake-semester-select">学期:</label>
                    <select id="retake-semester-select">
                        <option value="">全部学期</option><option value="3">第一学期</option><option value="12">第二学期</option>
                    </select>
                    <button id="start-query-btn">开始查询</button>
                </div>
                <div id="retake-result-content"><p style="text-align:center; color:#888;">请选择学年和学期后点击查询。</p></div>`;
            assistant.populateModal('重修课程查询', content, () => {
                if (!assistant.getStudentId()) {
                    $('#retake-result-content').html('<p style="color:red; text-align:center;">错误：无法自动获取到您的学号！</p>');
                    $('#start-query-btn').prop('disabled', true);
                    return;
                }
                $('#start-query-btn').on('click', retakeQuerier.executeQuery);
            }, false);
        },
        executeQuery: async () => {
            const studentId = assistant.getStudentId();
            const year = $('#retake-year-select').val();
            const semester = $('#retake-semester-select').val();
            const resultContent = $('#retake-result-content');
            resultContent.html('<div id="loading-spinner"></div><p style="text-align:center;">正在查询中...</p>');
            let promises = [];
            if (semester === "") {
                promises.push(retakeQuerier.fetchRetakeData(studentId, year, "3"));
                promises.push(retakeQuerier.fetchRetakeData(studentId, year, "12"));
            } else {
                promises.push(retakeQuerier.fetchRetakeData(studentId, year, semester));
            }
            try {
                const results = await Promise.all(promises);
                let allCourses = [];
                results.forEach(responseJson => {
                    if (responseJson && responseJson.items) {
                        responseJson.items.forEach(item => { if (item.cj && !allCourses.some(c => c.kch_id === item.kch_id && c.kcmc === item.kcmc)) { allCourses.push(item); } });
                    }
                });
                // 设置初始排序状态并排序
                retakeQuerier.sortState = { key: 'cj', direction: 'asc' };
                allCourses.sort((a, b) => parseFloat(a.cj) - parseFloat(b.cj));

                retakeQuerier.currentCourseData = allCourses;
                retakeQuerier.displayResults();
            } catch (error) {
                console.error('查询出错:', error);
                resultContent.html(`<p style="color:red; text-align:center;">查询失败，请检查网络或查看浏览器控制台(F12)的错误信息。</p>`);
            }
        },
        fetchRetakeData: (studentId, academicYear, semester) => {
            const url = `https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmList.html?gnmkdm=N1056&su=${studentId}`;
            const formData = new URLSearchParams({ "doType": "query", "cxxnm": academicYear, "cxxqm": semester, "_search": "false", "nd": Date.now(), "queryModel.showCount": "1000", "queryModel.currentPage": "1", "queryModel.sortName": "cj", "queryModel.sortOrder": "asc" });
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST", url: url, data: formData.toString(),
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    onload: function(response) {
                        if (response.status === 200) { try { resolve(JSON.parse(response.responseText)); } catch (e) { resolve(null); } }
                        else { reject(new Error(`HTTP status ${response.status}`)); }
                    },
                    onerror: function(error) { reject(error); }
                });
            });
        },
        sortTable: (newSortKey) => {
            // 如果点击的是当前排序列，则切换排序方向；否则默认升序
            if (retakeQuerier.sortState.key === newSortKey) {
                retakeQuerier.sortState.direction = retakeQuerier.sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                retakeQuerier.sortState.key = newSortKey;
                retakeQuerier.sortState.direction = 'asc';
            }

            // 根据新的排序状态对数据进行排序
            retakeQuerier.currentCourseData.sort((a, b) => {
                const sortKey = retakeQuerier.sortState.key;
                const sortDir = retakeQuerier.sortState.direction;
                let valA = a[sortKey], valB = b[sortKey];

                if (['cj', 'xf', 'cxcj'].includes(sortKey)) {
                    valA = parseFloat(valA) || -1;
                    valB = parseFloat(valB) || -1;
                    return sortDir === 'asc' ? valA - valB : valB - valA;
                } else {
                    valA = (valA || '').toString();
                    valB = (valB || '').toString();
                    return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
            });

            retakeQuerier.displayResults();
        },
        displayResults: () => {
            const resultContent = $('#retake-result-content');
            if (!retakeQuerier.currentCourseData || retakeQuerier.currentCourseData.length === 0) {
                resultContent.html('<p style="text-align:center; color: green; font-weight: bold;">查询完毕，该时间段内没有需要重修的课程。</p>');
                return;
            }
            let tableHTML = `<table class="result-table"><thead><tr><th>序号</th><th class="sortable-header" data-sort-key="kcmc">课程名称</th><th class="sortable-header" data-sort-key="xf">学分</th><th>课程属性</th><th class="sortable-header" data-sort-key="cj">原始成绩</th><th class="sortable-header" data-sort-key="cxcj">重修成绩</th></tr></thead><tbody>`;
            retakeQuerier.currentCourseData.forEach((course, index) => {
                tableHTML += `<tr><td>${index + 1}</td><td>${course.kcmc ? course.kcmc.split('<br>')[0] : 'N/A'}</td><td>${course.xf || 'N/A'}</td><td>${course.kcsxmc || 'N/A'}</td><td style="color: red; font-weight: bold;">${course.cj || 'N/A'}</td><td>${course.cxcj || '无'}</td></tr>`;
            });
            tableHTML += '</tbody></table>';
            resultContent.html(tableHTML);

            // 根据当前的排序状态，给对应的表头添加排序指示样式
            const sortedHeader = resultContent.find(`.sortable-header[data-sort-key="${retakeQuerier.sortState.key}"]`);
            if(sortedHeader.length) {
                const sortClass = retakeQuerier.sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc';
                sortedHeader.addClass(sortClass);
            }

            // 为可排序的表头重新绑定点击事件
            resultContent.find('.sortable-header').each((i, header) => {
                $(header).on('click', () => retakeQuerier.sortTable(header.dataset.sortKey));
            });
        }
    };

    // --- 启动脚本 ---
    $(document).ready(assistant.init);

})();