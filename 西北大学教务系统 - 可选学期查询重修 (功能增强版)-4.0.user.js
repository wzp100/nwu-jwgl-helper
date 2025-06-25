// ==UserScript==
// @name         西北大学教务系统 - 可选学期查询重修 (功能增强版)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  在西北大学教务系统页面添加一个按钮，弹窗后可自由选择学年和学期，精准查询可重修的课程。
// @author       Gemini AI & User Feedback
// @match        https://jwgl.nwu.edu.cn/jwglxt/xtgl/index_initMenu.html*
// @match        https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmIndex.html*
// @connect      jwgl.nwu.edu.cn
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 样式定义 ---
    GM_addStyle(`
        #retake-query-btn {
            position: fixed;
            top: 10px;
            right: 150px;
            z-index: 9999;
            padding: 8px 15px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #retake-query-btn:hover {
            background-color: #0056b3;
        }
        #result-modal {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 80%; max-width: 800px; max-height: 80vh;
            background-color: white; border: 1px solid #ccc;
            border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none; /* 默认隐藏 */
            flex-direction: column;
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
        #result-content th, #result-content td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        #result-content th { background-color: #f2f2f2; }
        #loading-spinner {
             border: 5px solid #f3f3f3; border-top: 5px solid #3498db;
             border-radius: 50%; width: 40px; height: 40px;
             animation: spin 1s linear infinite;
             margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `);


    function getStudentId() {
        const xh_id_element = document.getElementById('xh_id');
        if (xh_id_element && xh_id_element.value) return xh_id_element.value;
        try {
             let studentId = new URLSearchParams(window.top.location.search).get('su');
             if (studentId) return studentId;
        } catch(e) {}
        try {
            const userElement = window.top.document.querySelector('#sessionUser .media-body span.ng-binding');
            if (userElement && userElement.textContent) {
                const match = userElement.textContent.match(/\d+/);
                if (match) return match[0];
            }
        } catch(e) {}
        return null;
    }

    function setupUI() {
        const queryButton = document.createElement('button');
        queryButton.id = 'retake-query-btn';
        queryButton.innerText = '查询重修课程';
        document.body.appendChild(queryButton);

        const modal = document.createElement('div');
        modal.id = 'result-modal';
        modal.innerHTML = `
            <div id="result-header">
                <h2>重修课程查询</h2>
                <button id="result-close-btn">关闭</button>
            </div>
            <div id="query-controls">
                <label for="year-select">学年:</label>
                <select id="year-select"></select>
                <label for="semester-select">学期:</label>
                <select id="semester-select">
                    <option value="">全部学期</option>
                    <option value="3">第一学期</option>
                    <option value="12">第二学期</option>
                </select>
                <button id="start-query-btn">开始查询</button>
            </div>
            <div id="result-content">
                <p style="text-align:center; color:#888; margin-top: 20px;">请选择学年和学期后点击查询。</p>
            </div>
        `;
        document.body.appendChild(modal);

        queryButton.addEventListener('click', openQueryModal);
        document.getElementById('result-close-btn').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('start-query-btn').addEventListener('click', executeQuery);
    }

    function openQueryModal() {
        const studentId = getStudentId();
        if (!studentId) {
            alert('错误：无法自动获取到您的学号！');
            return;
        }

        const yearSelect = document.getElementById('year-select');
        yearSelect.innerHTML = ''; // 清空旧选项

        const entryYear = parseInt(studentId.substring(0, 4));
        const currentYear = new Date().getFullYear();

        for (let year = entryYear; year <= currentYear; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}-${year + 1}学年`;
            yearSelect.appendChild(option);
        }
        // 默认选中当前学年
        yearSelect.value = currentYear;

        document.getElementById('result-modal').style.display = 'flex';
    }


    async function executeQuery() {
        const studentId = getStudentId();
        if (!studentId) {
            alert('错误：无法获取学号，无法查询！');
            return;
        }

        const year = document.getElementById('year-select').value;
        const semester = document.getElementById('semester-select').value;

        const resultContent = document.getElementById('result-content');
        resultContent.innerHTML = '<div id="loading-spinner"></div><p style="text-align:center;">正在查询中...</p>';

        let promises = [];
        if (semester === "") { // 查询全部学期
            promises.push(fetchRetakeData(studentId, year, "3"));
            promises.push(fetchRetakeData(studentId, year, "12"));
        } else { // 查询指定学期
            promises.push(fetchRetakeData(studentId, year, semester));
        }

        try {
            const results = await Promise.all(promises);
            let allCourses = [];
            results.forEach(responseJson => {
                if (responseJson && responseJson.items) {
                    responseJson.items.forEach(item => {
                        // 确保有成绩且不重复
                        if (item.cj && !allCourses.some(c => c.kch_id === item.kch_id && c.kcmc === item.kcmc)) {
                           allCourses.push(item);
                        }
                    });
                }
            });

            allCourses.sort((a, b) => parseFloat(a.cj) - parseFloat(b.cj));
            displayResults(allCourses);

        } catch (error) {
            console.error('查询出错:', error);
            resultContent.innerHTML = `<p style="color:red; text-align:center;">查询失败，请检查网络或查看浏览器控制台(F12)的错误信息。</p>`;
        }
    }


    function fetchRetakeData(studentId, academicYear, semester) {
        const url = `https://jwgl.nwu.edu.cn/jwglxt/cxbm/cxbm_cxXscxbmList.html?gnmkdm=N1056&su=${studentId}`;
        const formData = new URLSearchParams({
            "doType": "query", "cxxnm": academicYear, "cxxqm": semester, "pc": "1",
            "njdm_id": academicYear, "zyh_id": "1803", "zyfx_id": "wfx", "kkbm_id": "",
            "pyccdm": "3", "xqh_id": "1", "kcdmmc": "", "jsxmgh": "", "jxbmc": "",
            "kklxdm": "-1", "yxzx": "0", "kbmbj": "0", "tkbsfzy": "0", "zntxbl": "0",
            "zbzqxqjhkcbj": "", "_search": "false", "nd": Date.now(),
            "queryModel.showCount": "1000", "queryModel.currentPage": "1",
            "queryModel.sortName": "cj", "queryModel.sortOrder": "asc", "time": "0"
        });

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: url, data: formData.toString(),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest"
                },
                onload: function(response) {
                    if (response.status === 200) {
                        try { resolve(JSON.parse(response.responseText)); }
                        catch (e) { resolve(null); }
                    } else { reject(new Error(`HTTP status ${response.status}`)); }
                },
                onerror: function(error) { reject(error); }
            });
        });
    }

    function displayResults(courses) {
        const resultContent = document.getElementById('result-content');
        if (!courses || courses.length === 0) {
            resultContent.innerHTML = '<p style="text-align:center; color: green; font-weight: bold;">查询完毕，该时间段内没有需要重修的课程。</p>';
            return;
        }

        let tableHTML = `
            <table>
                <thead><tr><th>序号</th><th>课程名称</th><th>学分</th><th>课程属性</th><th>原始成绩</th><th>重修成绩</th></tr></thead>
                <tbody>`;

        courses.forEach((course, index) => {
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
    }

    window.addEventListener('load', function() {
        setupUI();
    }, false);

})();