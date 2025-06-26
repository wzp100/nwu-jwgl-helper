// ==UserScript==
// @name         教务系统助手 (成绩导出 & 重修查询)
// @namespace    ikaikail@ikaikail.com
// @version      2.2
// @description  在方正/西北大学教务系统页面添加一个统一的助手按钮，提供成绩导出(支持全部学年)和重修查询功能。
// @author       iKaiKail & Gemini AI & tianji
// @match        *://*/jwglxt/cjcx/*
// @match        https://jwgl.nwu.edu.cn/jwglxt/xtgl/index_initMenu.html*
// @match        https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmIndex.html*
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
                    padding: 8px 15px; background-color: #007bff; color: white;
                    border: none; border-radius: 5px; cursor: pointer; font-size: 14px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                }
                #assistant-btn:hover { background-color: #0056b3; }
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
                .assistant-close-btn {
                    padding: 5px 10px; background-color: #e0e0e0;
                    border: 1px solid #ccc; cursor: pointer;
                }
                .assistant-content { padding: 20px; overflow-y: auto; flex-grow: 1; }
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
                .result-table { width: 100%; border-collapse: collapse; }
                .result-table th, .result-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                .result-table th { background-color: #f2f2f2; position: relative; }
                .sortable-header { cursor: pointer; user-select: none; }
                .sortable-header:hover { background-color: #e0e0e0; }
                .sortable-header::after {
                    content: ''; display: inline-block; margin-left: 5px; opacity: 0.5;
                    width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent;
                }
                .sort-asc::after { border-bottom: 5px solid #333; opacity: 1; }
                .sort-desc::after { border-top: 5px solid #333; opacity: 1; }
                #loading-spinner {
                     border: 5px solid #f3f3f3; border-top: 5px solid #3498db;
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
                        <button class="assistant-close-btn">关闭</button>
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
        openModal: () => assistant.elements.modal.css('display', 'flex'),
        closeModal: () => assistant.elements.modal.css('display', 'none'),

        /**
         * 动态填充模态窗口内容
         * @param {string} title - 模态窗口的标题
         * @param {string} contentHTML - 内容区的HTML
         * @param {function} onReady - HTML填充后的回调函数
         * @param {boolean} addAllYearsOption - 是否添加“全部学年”选项
         */
        populateModal: (title, contentHTML, onReady, addAllYearsOption = false) => {
            assistant.elements.modalTitle.text(title);
            assistant.elements.modalContent.html(contentHTML);
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
                // 根据是否添加了“全部学年”来设置默认值
                if (addAllYearsOption) {
                    yearSelect.val('');
                } else {
                    yearSelect.val(currentYear);
                }
            }
            if (onReady && typeof onReady === 'function') {
                onReady();
            }
        },

        // --- 通用功能 ---
        getStudentId: () => {
            const xh_id_element = document.getElementById('xh_id');
            if (xh_id_element && xh_id_element.value) return xh_id_element.value;
            try { let studentId = new URLSearchParams(window.top.location.search).get('su'); if (studentId) return studentId; } catch (e) {}
            try { const userElement = window.top.document.querySelector('#sessionUser .media-body span.ng-binding'); if (userElement && userElement.textContent) { const match = userElement.textContent.match(/\d+/); if (match) return match[0]; } } catch (e) {}
            return null;
        },

        // --- 路由与初始化 ---
        init: () => {
            const currentUrl = window.location.href;
            assistant.setupUI();

            if (/\/jwglxt\/cjcx\//.test(currentUrl)) {
                assistant.elements.assistantBtn.on('click', () => {
                    gradeExporter.configureModal();
                });
            } else if (currentUrl.includes('jwgl.nwu.edu.cn/jwglxt/')) {
                assistant.elements.assistantBtn.on('click', () => {
                    retakeQuerier.configureModal();
                });
            }
        }
    };


    /* ================================================================================= */
    /* =================== 功能一: 成绩分项下载 (支持全部学年) =================== */
    /* ================================================================================= */

    const gradeExporter = {
        configureModal: () => {
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
            // 调用 populateModal 时，最后一个参数传 true，以添加“全部学年”
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
    /* =================== 功能二: 重修查询助手 (已修复) =================== */
    /* ================================================================================= */

    const retakeQuerier = {
        currentCourseData: [],

        configureModal: () => {
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
            // 调用 populateModal 时，最后一个参数为 false，不添加“全部学年”
            assistant.populateModal('重修课程查询', content, () => {
                if (!assistant.getStudentId()) {
                    $('#retake-result-content').html('<p style="color:red; text-align:center;">错误：无法自动获取到您的学号！</p>');
                    $('#start-query-btn').prop('disabled', true);
                    return;
                }
                $('#start-query-btn').on('click', retakeQuerier.executeQuery);
            }, false);
        },

        // 恢复为原始、正确的请求逻辑
        executeQuery: async () => {
            const studentId = assistant.getStudentId();
            const year = $('#retake-year-select').val();
            const semester = $('#retake-semester-select').val();
            const resultContent = $('#retake-result-content');
            resultContent.html('<div id="loading-spinner"></div><p style="text-align:center;">正在查询中...</p>');

            let promises = [];
            // 使用与原始脚本一致的、经过验证的逻辑
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
                    method: "POST",
                    url: url,
                    data: formData.toString(),
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                resolve(null);
                            }
                        } else {
                            reject(new Error(`HTTP status ${response.status}`));
                        }
                    },
                    onerror: function(error) {
                        reject(error);
                    }
                });
            });
        },

        sortTable: (sortKey, headerCell) => {
            const currentSortDir = headerCell.dataset.sortDir || 'desc';
            const newSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
            retakeQuerier.currentCourseData.sort((a, b) => {
                let valA = a[sortKey], valB = b[sortKey];
                if (['cj', 'xf', 'cxcj'].includes(sortKey)) {
                    valA = parseFloat(valA) || -1;
                    valB = parseFloat(valB) || -1;
                    return newSortDir === 'asc' ? valA - valB : valB - valA;
                } else {
                    valA = (valA || '').toString();
                    valB = (valB || '').toString();
                    return newSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
            });
            $('#retake-result-content .sortable-header').each((i, th) => {
                th.dataset.sortDir = '';
                $(th).removeClass('sort-asc sort-desc');
            });
            headerCell.dataset.sortDir = newSortDir;
            $(headerCell).addClass(newSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            retakeQuerier.displayResults();
        },

        displayResults: () => {
            const resultContent = $('#retake-result-content');
            if (!retakeQuerier.currentCourseData || retakeQuerier.currentCourseData.length === 0) {
                resultContent.html('<p style="text-align:center; color: green; font-weight: bold;">查询完毕，该时间段内没有需要重修的课程。</p>');
                return;
            }
            let tableHTML = `
                <table class="result-table">
                    <thead>
                        <tr>
                            <th>序号</th>
                            <th class="sortable-header" data-sort-key="kcmc">课程名称</th>
                            <th class="sortable-header" data-sort-key="xf">学分</th>
                            <th>课程属性</th>
                            <th class="sortable-header" data-sort-key="cj">原始成绩</th>
                            <th class="sortable-header" data-sort-key="cxcj">重修成绩</th>
                        </tr>
                    </thead>
                    <tbody>`;
            retakeQuerier.currentCourseData.forEach((course, index) => {
                tableHTML += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${course.kcmc ? course.kcmc.split('<br>')[0] : 'N/A'}</td>
                        <td>${course.xf || 'N/A'}</td>
                        <td>${course.kcsxmc || 'N/A'}</td>
                        <td style="color: red; font-weight: bold;">${course.cj || 'N/A'}</td>
                        <td>${course.cxcj || '无'}</td>
                    </tr>`;
            });
            tableHTML += '</tbody></table>';
            resultContent.html(tableHTML);
            resultContent.find('.sortable-header').each((i, header) => {
                $(header).on('click', () => retakeQuerier.sortTable(header.dataset.sortKey, header));
            });
        }
    };

    // --- 启动脚本 ---
    $(document).ready(assistant.init);

})();