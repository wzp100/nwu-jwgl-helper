// ==UserScript==
// @name         西北大学教务系统 - 可排序查询重修 (终极版)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  在西北大学教务系统页面添加一个按钮，弹窗后可自由选择学年学期查询，并且查询结果可点击表头进行排序。
// @author       Gemini AI & tianji
// @match        https://jwgl.nwu.edu.cn/jwglxt/xtgl/index_initMenu.html*
// @match        https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmIndex.html*
// @connect      jwgl.nwu.edu.cn
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局变量，用于存储当前查询到的课程数据 ---
    let currentCourseData = [];

    // --- 样式定义 ---
    GM_addStyle(`
        /* ... (弹窗和按钮样式保持不变) ... */
        #retake-query-btn {
            position: fixed; top: 10px; right: 150px; z-index: 9999;
            padding: 8px 15px; background-color: #007bff; color: white;
            border: none; border-radius: 5px; cursor: pointer; font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #retake-query-btn:hover { background-color: #0056b3; }
        #result-modal {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 80%; max-width: 800px; max-height: 80vh;
            background-color: white; border: 1px solid #ccc;
            border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000; display: none; flex-direction: column;
        }
        #result-header {
            padding: 15px; background-color: #f7f7f7;
            border-bottom: 1px solid #ddd;
            display: flex; justify-content: space-between; align-items: center;
        }
        #result-header h2 { margin: 0; font-size: 18px; }
        #result-close-btn {
            padding: 5px 10px; background-color: #e0e0e0;
            border: 1px solid #ccc; cursor: pointer;
        }
        #query-controls {
            padding: 15px; display: flex; align-items: center; gap: 15px;
            border-bottom: 1px solid #eee;
        }
        #query-controls label { font-weight: bold; margin-bottom: 0; }
        #query-controls select, #query-controls button {
            padding: 5px 10px; border-radius: 4px; border: 1px solid #ccc;
        }
        #query-controls button { background-color: #28a745; color: white; cursor: pointer; }
        #query-controls button:hover { background-color: #218838; }
        #result-content { padding: 20px; overflow-y: auto; flex-grow: 1; }
        #result-content table { width: 100%; border-collapse: collapse; }
        #result-content td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        #result-content th {
            border: 1px solid #ddd; padding: 8px; text-align: center;
            background-color: #f2f2f2; position: relative;
        }
        /* 【新增】排序相关样式 */
        .sortable-header {
            cursor: pointer;
            user-select: none;
        }
        .sortable-header:hover {
            background-color: #e0e0e0;
        }
        .sortable-header::after {
            content: '';
            display: inline-block;
            margin-left: 5px;
            opacity: 0.5;
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
        }
        .sort-asc::after {
            border-bottom: 5px solid #333; /* Up arrow ▲ */
            opacity: 1;
        }
        .sort-desc::after {
            border-top: 5px solid #333; /* Down arrow ▼ */
            opacity: 1;
        }
        #loading-spinner {
             border: 5px solid #f3f3f3; border-top: 5px solid #3498db;
             border-radius: 50%; width: 40px; height: 40px;
             animation: spin 1s linear infinite; margin: 20px auto;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `);

    // --- 核心功能函数 ---
    function getStudentId() { /* ... (无变化) ... */
        const xh_id_element = document.getElementById('xh_id');
        if (xh_id_element && xh_id_element.value) return xh_id_element.value;
        try { let studentId = new URLSearchParams(window.top.location.search).get('su'); if (studentId) return studentId; } catch(e) {}
        try { const userElement = window.top.document.querySelector('#sessionUser .media-body span.ng-binding'); if (userElement && userElement.textContent) { const match = userElement.textContent.match(/\d+/); if (match) return match[0]; } } catch(e) {}
        return null;
    }

    function setupUI() { /* ... (HTML结构无变化) ... */
        const queryButton = document.createElement('button');
        queryButton.id = 'retake-query-btn';
        queryButton.innerText = '查询重修课程';
        document.body.appendChild(queryButton);
        const modal = document.createElement('div');
        modal.id = 'result-modal';
        modal.innerHTML = `
            <div id="result-header"><h2>重修课程查询</h2><button id="result-close-btn">关闭</button></div>
            <div id="query-controls">
                <label for="year-select">学年:</label><select id="year-select"></select>
                <label for="semester-select">学期:</label>
                <select id="semester-select">
                    <option value="">全部学期</option><option value="3">第一学期</option><option value="12">第二学期</option>
                </select>
                <button id="start-query-btn">开始查询</button>
            </div>
            <div id="result-content"><p style="text-align:center; color:#888; margin-top: 20px;">请选择学年和学期后点击查询。</p></div>
        `;
        document.body.appendChild(modal);
        queryButton.addEventListener('click', openQueryModal);
        document.getElementById('result-close-btn').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('start-query-btn').addEventListener('click', executeQuery);
    }

    function openQueryModal() { /* ... (无变化) ... */
        const studentId = getStudentId();
        if (!studentId) { alert('错误：无法自动获取到您的学号！'); return; }
        const yearSelect = document.getElementById('year-select');
        yearSelect.innerHTML = '';
        const entryYear = parseInt(studentId.substring(0, 4));
        const currentYear = new Date().getFullYear();
        for (let year = entryYear; year <= currentYear; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}-${year + 1}学年`;
            yearSelect.appendChild(option);
        }
        yearSelect.value = currentYear;
        document.getElementById('result-modal').style.display = 'flex';
    }

    async function executeQuery() { /* ... (查询逻辑无变化, 只是增加了数据存储) ... */
        const studentId = getStudentId();
        const year = document.getElementById('year-select').value;
        const semester = document.getElementById('semester-select').value;
        const resultContent = document.getElementById('result-content');
        resultContent.innerHTML = '<div id="loading-spinner"></div><p style="text-align:center;">正在查询中...</p>';
        let promises = [];
        if (semester === "") {
            promises.push(fetchRetakeData(studentId, year, "3"));
            promises.push(fetchRetakeData(studentId, year, "12"));
        } else {
            promises.push(fetchRetakeData(studentId, year, semester));
        }
        try {
            const results = await Promise.all(promises);
            let allCourses = [];
            results.forEach(responseJson => {
                if (responseJson && responseJson.items) {
                    responseJson.items.forEach(item => { if (item.cj && !allCourses.some(c => c.kch_id === item.kch_id && c.kcmc === item.kcmc)) { allCourses.push(item); } });
                }
            });
            // 默认按原始成绩升序排序
            allCourses.sort((a, b) => parseFloat(a.cj) - parseFloat(b.cj));
            currentCourseData = allCourses; // 【重要】将获取的数据存到全局变量
            displayResults(); // 显示结果
        } catch (error) {
            console.error('查询出错:', error);
            resultContent.innerHTML = `<p style="color:red; text-align:center;">查询失败，请检查网络或查看浏览器控制台(F12)的错误信息。</p>`;
        }
    }

    function fetchRetakeData(studentId, academicYear, semester) { /* ... (无变化) ... */
        const url = `https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmList.html?gnmkdm=N1056&su=${studentId}`;
        const formData = new URLSearchParams({ "doType": "query", "cxxnm": academicYear, "cxxqm": semester, "_search": "false", "nd": Date.now(), "queryModel.showCount": "1000", "queryModel.currentPage": "1", "queryModel.sortName": "cj", "queryModel.sortOrder": "asc" });
        return new Promise((resolve, reject) => { GM_xmlhttpRequest({ method: "POST", url: url, data: formData.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" }, onload: function(response) { if (response.status === 200) { try { resolve(JSON.parse(response.responseText)); } catch (e) { resolve(null); } } else { reject(new Error(`HTTP status ${response.status}`)); } }, onerror: function(error) { reject(error); } }); });
    }

    /**
     * 【新增】排序函数
     * @param {string} sortKey - 用于排序的字段名 (如 'cj', 'xf')
     * @param {HTMLElement} headerCell - 被点击的表头元素
     */
    function sortTable(sortKey, headerCell) {
        const currentSortDir = headerCell.dataset.sortDir || 'desc';
        const newSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';

        currentCourseData.sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];

            // 处理数字和字符串的不同排序方式
            if (sortKey === 'cj' || sortKey === 'xf' || sortKey === 'cxcj') {
                valA = parseFloat(valA) || -1; // 空值排在最前面
                valB = parseFloat(valB) || -1;
                return newSortDir === 'asc' ? valA - valB : valB - valA;
            } else {
                valA = (valA || '').toString();
                valB = (valB || '').toString();
                return newSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
        });

        // 更新表头元素的排序方向状态
        document.querySelectorAll('#result-content th').forEach(th => th.dataset.sortDir = '');
        headerCell.dataset.sortDir = newSortDir;

        displayResults(); // 使用已排序的数据重新渲染表格
    }

    /**
     * 【修改】渲染结果表格, 并为表头添加事件
     */
    function displayResults() {
        const resultContent = document.getElementById('result-content');
        if (!currentCourseData || currentCourseData.length === 0) {
            resultContent.innerHTML = '<p style="text-align:center; color: green; font-weight: bold;">查询完毕，该时间段内没有需要重修的课程。</p>';
            return;
        }

        // data-sort-key 用于指定排序时依据的对象属性
        let tableHTML = `
            <table>
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

        currentCourseData.forEach((course, index) => {
            const courseName = course.kcmc ? course.kcmc.split('<br>')[0] : 'N/A';
            tableHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${courseName}</td>
                    <td>${course.xf || 'N/A'}</td>
                    <td>${course.kcsxmc || 'N/A'}</td>
                    <td style="color: red; font-weight: bold;">${course.cj || 'N/A'}</td>
                    <td>${course.cxcj || '无'}</td>
                </tr>`;
        });

        tableHTML += '</tbody></table>';
        resultContent.innerHTML = tableHTML;

        // 【重要】为新生成的表头添加点击事件和排序视觉提示
        const headers = resultContent.querySelectorAll('.sortable-header');
        headers.forEach(header => {
            // 添加点击监听器
            header.addEventListener('click', () => sortTable(header.dataset.sortKey, header));

            // 更新排序箭头显示
            const sortDir = header.dataset.sortDir;
            header.classList.remove('sort-asc', 'sort-desc');
            if (sortDir === 'asc') {
                header.classList.add('sort-asc');
            } else if (sortDir === 'desc') {
                header.classList.add('sort-desc');
            }
        });
    }

    // --- 脚本启动 ---
    window.addEventListener('load', function() {
        setupUI();
    }, false);

})();