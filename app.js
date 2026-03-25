/* ================================================================
   PROJECT MAP — Interactive Mind Map (v2 — Full Navigation + QoL)
   ================================================================ */

(function () {
  'use strict';

  // ---- Revision Chat History (persists across overlay open/close per action key) ----
  const revisionChatHistory = {};

  // ---- API Base URL (works locally and after deploy via proxy) ----
  const API_BASE = '__PORT_8000__'.startsWith('__') ? 'http://localhost:8000' : '__PORT_8000__';

  // ---- Todo Checked State ----
  var todoCheckedState = {};
  var todoStateLoaded = false;

  function saveTodoState() {
    fetch(API_BASE + '/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todoCheckedState)
    }).catch(function(err) { console.warn('Todo save failed:', err); });
  }

  function loadTodoState() {
    if (todoStateLoaded) return Promise.resolve();
    return fetch(API_BASE + '/api/todos')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        todoCheckedState = data || {};
        todoStateLoaded = true;
      })
      .catch(function() { todoStateLoaded = true; });
  }

  // ---- Banner Editor ----
  (function initBannerEditor() {
    const area = document.getElementById('bannerArea');
    const img = document.getElementById('bannerImg');
    const editBtn = document.getElementById('bannerEditBtn');
    const doneBtn = document.getElementById('bannerDoneBtn');
    const uploadBtn = document.getElementById('bannerUploadBtn');
    const fileInput = document.getElementById('bannerFileInput');
    const zoomInBtn = document.getElementById('bannerZoomIn');
    const zoomOutBtn = document.getElementById('bannerZoomOut');
    const zoomLevel = document.getElementById('bannerZoomLevel');
    if (!area || !img) return;

    // State
    let editing = false;
    let imgX = 0, imgY = 0, imgW = 0, imgH = 0;
    let naturalW = 0, naturalH = 0;
    let baseW = 0; // the "100%" reference width
    let dragging = false, dragStartX = 0, dragStartY = 0, dragImgStartX = 0, dragImgStartY = 0;
    let hasNewUpload = false; // track if user uploaded a new image this session

    // Apply image position
    function applyPosition() {
      img.style.left = imgX + 'px';
      img.style.top = imgY + 'px';
      img.style.width = imgW + 'px';
      img.style.height = imgH + 'px';
      img.style.transform = 'none';
      // Update zoom level display
      if (zoomLevel && baseW > 0) {
        const pct = Math.round((imgW / baseW) * 100);
        zoomLevel.textContent = pct + '%';
      }
    }

    // Zoom the image by a factor, anchored to the center of the visible area
    function zoomBy(factor) {
      const areaW = area.offsetWidth;
      const areaH = area.offsetHeight;
      const centerX = areaW / 2;
      const centerY = areaH / 2;
      // Where is the center relative to the image?
      const relX = (centerX - imgX) / imgW;
      const relY = (centerY - imgY) / imgH;
      const aspect = naturalW / naturalH;
      const newW = Math.max(100, imgW * factor);
      const newH = newW / aspect;
      // Keep the same point under the center
      imgX = centerX - relX * newW;
      imgY = centerY - relY * newH;
      imgW = newW;
      imgH = newH;
      applyPosition();
    }

    // Initialize image size/pos on load
    function initImageSize() {
      const areaRect = area.getBoundingClientRect();
      naturalW = img.naturalWidth || 1500;
      naturalH = img.naturalHeight || 800;
      // Fill width with some overshoot, keep aspect ratio
      imgW = areaRect.width * 1.1;
      imgH = (imgW / naturalW) * naturalH;
      imgX = (areaRect.width - imgW) / 2;
      imgY = 0;
      baseW = imgW;
      applyPosition();
    }

    let bannerSaved = false; // once saved, don't auto-resize
    if (img.complete) initImageSize();
    else img.addEventListener('load', initImageSize);
    // Only auto-resize on window resize if user hasn't saved a custom position
    window.addEventListener('resize', () => { if (!editing && !bannerSaved) initImageSize(); });

    // ---- Hardcoded default banner position (works without server) ----
    const DEFAULT_BANNER_POSITION = { x: 0, y: -26, w: null, h: null, baseW: null };
    // The defaults use a ratio-based approach: y offset = -26px, image fills area width * 1.1
    // If server has saved data it overrides these; otherwise these are used.

    // Load saved banner from server (overrides defaults if settings exist)
    loadBanner();

    // Enter edit mode
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editing = true;
      area.classList.add('editing');
      document.body.classList.add('banner-editing');
      applyPosition();
    });

    function exitEditing() {
      editing = false;
      area.classList.remove('editing');
      document.body.classList.remove('banner-editing');
    }

    // Save banner to server (persistent across refreshes)
    async function saveBanner() {
      const payload = {
        position: { x: imgX, y: imgY, w: imgW, h: imgH, baseW: baseW }
      };
      // Include image data only if user uploaded a new one
      if (hasNewUpload && img.src.startsWith('data:')) {
        payload.imageData = img.src;
      }
      try {
        const resp = await fetch(API_BASE + '/api/banner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        bannerSaved = true;
        // If server saved a new file, update img src to the file URL
        if (data.image) {
          img.src = API_BASE + '/' + data.image + '?t=' + Date.now();
          hasNewUpload = false;
        }
      } catch (err) {
        console.warn('Banner save failed:', err);
      }
    }

    // Load saved banner from server
    async function loadBanner() {
      try {
        const resp = await fetch(API_BASE + '/api/banner');
        const data = await resp.json();
        const needsNewSrc = data.image && !img.src.endsWith(data.image);
        if (needsNewSrc) {
          img.src = API_BASE + '/' + data.image;
        }
        if (data.position) {
          const p = data.position;
          const applyAndReveal = () => {
            naturalW = img.naturalWidth || 1500;
            naturalH = img.naturalHeight || 800;
            imgX = p.x;
            imgY = p.y;
            imgW = p.w;
            imgH = p.h;
            baseW = p.baseW || imgW;
            applyPosition();
            bannerSaved = true;
            img.classList.add('banner-ready');
          };
          if (img.complete && !needsNewSrc) applyAndReveal();
          else img.addEventListener('load', applyAndReveal, { once: true });
        } else {
          // No saved position — just reveal with defaults
          const reveal = () => { initImageSize(); img.classList.add('banner-ready'); };
          if (img.complete) reveal();
          else img.addEventListener('load', reveal, { once: true });
        }
      } catch (err) {
        // API not available — use hardcoded default position
        const revealWithDefaults = () => {
          naturalW = img.naturalWidth || 1500;
          naturalH = img.naturalHeight || 800;
          const areaRect = area.getBoundingClientRect();
          imgW = areaRect.width * 1.1;
          imgH = (imgW / naturalW) * naturalH;
          imgX = (areaRect.width - imgW) / 2;
          imgY = DEFAULT_BANNER_POSITION.y;
          baseW = imgW;
          applyPosition();
          bannerSaved = true; // prevent auto-resize from overriding
          img.classList.add('banner-ready');
        };
        if (img.complete && img.naturalWidth > 0) revealWithDefaults();
        else {
          img.addEventListener('load', revealWithDefaults, { once: true });
          // Safety: if image fails to load, still show area with dark bg
          img.addEventListener('error', () => { img.classList.add('banner-ready'); }, { once: true });
        }
      }
    }

    // Exit edit mode + save
    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exitEditing();
      saveBanner();
    });

    // Upload new image
    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.src = ev.target.result;
        hasNewUpload = true;
        img.onload = () => {
          naturalW = img.naturalWidth;
          naturalH = img.naturalHeight;
          const areaRect = area.getBoundingClientRect();
          imgW = areaRect.width * 1.1;
          imgH = (imgW / naturalW) * naturalH;
          imgX = (areaRect.width - imgW) / 2;
          imgY = 0;
          baseW = imgW;
          applyPosition();
          img.classList.add('banner-ready');
        };
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });

    // --- Drag logic ---
    img.addEventListener('mousedown', (e) => {
      if (!editing) return;
      e.preventDefault();
      dragging = true;
      img.classList.add('dragging');
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragImgStartX = imgX;
      dragImgStartY = imgY;
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      imgX = dragImgStartX + dx;
      imgY = dragImgStartY + dy;
      applyPosition();
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        img.classList.remove('dragging');
      }
    });

    // --- Scroll-to-zoom (mouse wheel in edit mode) ---
    area.addEventListener('wheel', (e) => {
      if (!editing) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.93;
      zoomBy(factor);
    }, { passive: false });

    // --- Zoom buttons ---
    if (zoomInBtn) zoomInBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomBy(1.15); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomBy(0.87); });

    // ESC exits edit mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editing) {
        exitEditing();
      }
    });
  })();

  // ---- Configuration ----
  // Each workstream title gets a unique outline color
  const WS_COLORS = {
    negotiation: '#e06c75',  // warm red
    technical:   '#61afef',  // blue
    legal:       '#c678dd',  // purple
    documents:   '#d19a66',  // orange
    comms:       '#56b6c2',  // cyan
  };

  const WORKSTREAMS = [
    {
      id: 'negotiation', emoji: '🤝', title: 'Negotiation', angle: -45,
      tasks: [
        { id: 'neg-1', title: 'Rate Card Finalization', assignee: 'Anna Sørensen', status: 'green' },
        { id: 'neg-2', title: 'SLA Review', assignee: 'Erik Lindqvist', status: 'amber' },
        { id: 'neg-3', title: 'Vendor Onboarding Pack', assignee: 'Mette Hansen', status: 'green' }
      ]
    },
    {
      id: 'technical', emoji: '⚙️', title: 'Technical Setup', angle: 10,
      tasks: [
        { id: 'tech-1', title: 'API Integration', assignee: 'Lars Pedersen', status: 'red' },
        { id: 'tech-2', title: 'Data Migration Plan', assignee: 'Sofie Andersen', status: 'green' },
        { id: 'tech-3', title: 'Env. Provisioning', assignee: 'Nils Christensen', status: 'blue' }
      ]
    },
    {
      id: 'legal', emoji: '⚖️', title: 'Legal', angle: 60,
      tasks: [
        { id: 'leg-1', title: 'GDPR Compliance Audit', assignee: 'Katrine Møller', status: 'amber' },
        { id: 'leg-2', title: 'Contract Amendment', assignee: 'Frederik Jensen', status: 'green' }
      ]
    },
    {
      id: 'documents', emoji: '📄', title: 'Document Management', angle: 170,
      tasks: [
        { id: 'doc-1', title: 'Template Library', assignee: 'Ida Rasmussen', status: 'blue' },
        { id: 'doc-2', title: 'Version Control Policy', assignee: 'Magnus Nilsson', status: 'green' },
        { id: 'doc-3', title: 'Archive Migration', assignee: 'Astrid Olsen', status: 'amber' }
      ]
    },
    {
      id: 'comms', emoji: '💬', title: 'Stakeholder Comms', angle: -150,
      tasks: [
        { id: 'com-1', title: 'SteerCo Brief', assignee: 'Mikkel Holm', status: 'green' },
        { id: 'com-2', title: 'Client Update Email', assignee: 'Camilla Krogh', status: 'red' }
      ]
    }
  ];

  // Tasks that belong to multiple titles (secondary memberships)
  // Key = taskId, value = array of additional wsIds the task also belongs to
  const MULTI_TITLE = {
    'neg-2': ['legal'],       // SLA Review is also Legal
    'neg-3': ['legal'],       // Vendor Onboarding Pack is also Legal
    'leg-2': ['negotiation'], // Contract Amendment also Negotiation
    'com-2': ['technical'],   // Client Update Email also Technical (blocked by API)
    'doc-3': ['technical'],   // Archive Migration also Technical (encoding)
  };

  // ---- Task Detail Data ----
  const TASK_DATA = {
    'neg-1': {
      emoji: '🤝', title: 'Rate Card Finalization', status: 'On Track', statusColor: 'green',
      clickupId: 'rate-card-finalization',
      description: 'Finalize the rate card structure for Danish operations including tier pricing and volume discounts. All stakeholders have reviewed the latest draft.',
      dueDate: '28 Mar 2026', assignee: 'Anna Sørensen',
      documents: [{ name: '📄 Rate Card v3.2 — Final Draft.xlsx', href: '#' }, { name: '📄 Pricing Benchmark Report.pdf', href: '#' }],
      update: 'Anna confirmed all pricing tiers have been approved by Finance. Ready for final sign-off.', updateDate: '12 Mar 2026',
      emails: [{ name: '💬 Re: Rate Card Review — Anna → Diego', href: '#' }, { name: '💬 Pricing Approval Thread — Finance Team', href: '#' }],
      todos: [
        { text: 'Get final sign-off from Diego', suggestion: 'Rate card is Finance-approved. Schedule a 10-minute call with Diego or send a summary email requesting his sign-off by EOD. All tiers are validated — this is a formality.', actions: [{ label: 'Draft sign-off email to Diego', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Diego Ackermann requesting sign-off on the Finance-approved rate card. Include a brief summary of the approved tiers and mention that all validations are complete. Keep it concise — this is a formality.' }] },
        { text: 'Distribute signed rate card to vendor partners', suggestion: 'Once signed, share via the Vendor Onboarding Pack (neg-3). Mette Hansen is handling the pack — coordinate with her to include the final rate card in the bundle.', actions: [{ label: 'Draft coordination email to Mette', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Mette Hansen asking her to include the signed rate card in the Vendor Onboarding Pack (neg-3). Mention that the rate card has been signed and is ready for distribution.' }] },
        { text: 'Archive final version in Google Drive', suggestion: 'File under Denmark > Negotiation > Rate Cards. Update the Template Library (doc-1) index if this becomes a reusable template.', actions: [] }
      ]
    },
    'neg-2': {
      emoji: '🤝', title: 'SLA Review', status: 'Attention Needed', statusColor: 'amber',
      clickupId: 'sla-review',
      description: 'Review and negotiate the updated service level agreements for the Danish market. Client has raised concerns about uptime guarantees.',
      dueDate: '20 Mar 2026', assignee: 'Erik Lindqvist',
      documents: [{ name: '📄 SLA Framework v2.1.docx', href: '#' }, { name: '📄 Client Feedback Notes.pdf', href: '#' }],
      update: 'Client requested 99.95% uptime instead of proposed 99.9%. Escalated to technical team for feasibility.', updateDate: '13 Mar 2026',
      emails: [{ name: '💬 SLA Concerns — Client → Erik', href: '#' }, { name: '💬 Re: Uptime Requirements — Tech Team', href: '#' }],
      todos: [
        { text: 'Get feasibility assessment from Technical team on 99.95% uptime', suggestion: 'The API Integration (tech-1) is currently blocked which complicates this — the technical team needs to confirm infrastructure can support 99.95% once environments are stable. Ask Lars Pedersen and Nils Christensen (Env. Provisioning is done) for a joint assessment.', actions: [{ label: 'Draft assessment request', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Lars Pedersen and Nils Christensen requesting a joint feasibility assessment on supporting 99.95% uptime. Mention the current API Integration blocker and ask whether the provisioned infrastructure can handle the higher SLA once the blocker is resolved. Request a response by 17 Mar.' }] },
        { text: 'Prepare counter-proposal if 99.95% is not feasible', suggestion: 'Draft a tiered SLA: 99.9% standard with a 99.95% premium tier at additional cost. Use the Pricing Benchmark Report from the Rate Card work as justification for the cost difference.', actions: [{ label: 'Draft tiered SLA proposal', icon: '📄', type: 'create_doc', instruction: 'Create a tiered SLA counter-proposal document: Standard tier at 99.9% uptime, Premium tier at 99.95% with additional cost. Include justification for the pricing difference using the Rate Card benchmarks. Present it as a professional one-pager for client review.' }] },
        { text: 'Schedule client call to present SLA options', suggestion: 'Due date is 20 Mar — only 5 days away. Prioritize getting the technical assessment by 17 Mar, then schedule the client call for 18-19 Mar. Erik should lead with Diego on standby for escalation.', actions: [{ label: 'Schedule client call', icon: '📅', type: 'schedule_meeting', instruction: 'Schedule a client call for 18 or 19 Mar to present the SLA options. Erik Lindqvist should be the lead presenter, with Diego on standby for escalation. Include the SLA proposal document as a pre-read.' }, { label: 'Prepare call agenda', icon: '📝', type: 'create_doc', instruction: 'Create a brief call agenda for the client SLA presentation meeting: 1) Overview of SLA options (standard vs premium), 2) Technical justification for each tier, 3) Pricing breakdown, 4) Next steps and timeline. Include talking points for Erik.' }] }
      ]
    },
    'neg-3': {
      emoji: '🤝', title: 'Vendor Onboarding Pack', status: 'On Track', statusColor: 'green',
      clickupId: 'vendor-onboarding-pack',
      description: 'Prepare the vendor onboarding documentation package including compliance requirements and integration specifications.',
      dueDate: '5 Apr 2026', assignee: 'Mette Hansen',
      documents: [{ name: '📄 Vendor Onboarding Checklist.xlsx', href: '#' }, { name: '📄 Integration Spec Sheet.pdf', href: '#' }],
      update: 'Mette has completed 8 of 10 checklist items. Remaining items are pending legal review.', updateDate: '11 Mar 2026',
      emails: [{ name: '💬 Onboarding Progress — Mette → Diego', href: '#' }],
      todos: [
        { text: 'Get legal review for remaining 2 checklist items', suggestion: 'The GDPR Compliance Audit (leg-1) findings may affect these items. Coordinate with Katrine Møller — the DPO flagged two data processing activities that need documentation. Ensure the vendor onboarding compliance section aligns with whatever remediation is decided.', actions: [{ label: 'Draft review request to Katrine', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Katrine Møller requesting legal review of the remaining 2 vendor onboarding checklist items. Reference the GDPR Compliance Audit findings and the DPO-flagged data processing activities. Ask for alignment between the audit remediation and vendor compliance requirements.' }] },
        { text: 'Include finalized rate card once signed', suggestion: 'Rate Card Finalization (neg-1) is nearly done — Anna has Finance approval. Once Diego signs off, include the final version in the pack.', actions: [] }
      ]
    },
    'tech-1': {
      emoji: '⚙️', title: 'API Integration', status: 'Blocked', statusColor: 'red',
      clickupId: 'api-integration',
      description: 'Integrate the client\'s legacy API with the new Danish platform instance. Currently blocked due to authentication protocol mismatch.',
      dueDate: '15 Mar 2026', assignee: 'Lars Pedersen',
      documents: [{ name: '📄 API Integration Architecture.pdf', href: '#' }, { name: '📄 Auth Protocol Spec.docx', href: '#' }, { name: '📄 Error Log — Auth Failures.log', href: '#' }],
      update: 'Blocked: Client uses OAuth 1.0a while our system requires OAuth 2.0. Awaiting client IT response.', updateDate: '14 Mar 2026',
      emails: [{ name: '💬 API Auth Issue — Lars → Client IT', href: '#' }, { name: '💬 Re: Integration Blocker — Escalation', href: '#' }],
      todos: [
        { text: 'Escalate to client CTO for OAuth 2.0 migration timeline', suggestion: 'This task is overdue (due 15 Mar) and blocking the Client Update Email (com-2). Draft an escalation email to the client CTO explaining the technical gap and requesting a migration timeline or interim workaround by 17 Mar. Emphasize downstream impact on the project.', actions: [{ label: 'Draft CTO escalation email', icon: '🚨', type: 'draft_email', instruction: 'Draft a professional escalation email to the client CTO explaining the OAuth 1.0a vs 2.0 authentication mismatch blocking the API integration. Emphasize: task is overdue (due 15 Mar), downstream impact on Client Update Email and overall project timeline. Request either a migration timeline or approval for an interim workaround by 17 Mar.' }, { label: 'Prepare technical brief', icon: '📄', type: 'create_doc', instruction: 'Create a one-page technical brief explaining the OAuth 1.0a vs 2.0 authentication mismatch, the impact on the integration timeline, and two proposed solutions: (1) Client migrates to OAuth 2.0, (2) AllUnite builds a compatibility wrapper. Include pros/cons and estimated timelines for each approach.' }] },
        { text: 'Evaluate OAuth 1.0a compatibility wrapper as interim solution', suggestion: 'If the client cannot migrate quickly, Lars should evaluate building an OAuth 1.0a-to-2.0 translation layer. This adds complexity but could unblock integration within 3-5 days. Check if the Auth Protocol Spec.docx has enough detail on their implementation.', actions: [{ label: 'Research OAuth wrapper approach', icon: '🔍', type: 'research', instruction: 'Research best practices for building an OAuth 1.0a-to-2.0 translation layer. Include: common libraries/tools, estimated development time, security considerations, and potential risks. Provide a recommendation for Lars Pedersen on whether this is a viable 3-5 day interim solution.' }] },
        { text: 'Update Camilla Krogh on resolution timeline for client comms', suggestion: 'The Client Update Email (com-2) is blocked by this. Once you have a timeline (either from client or the wrapper approach), notify Camilla immediately so she can draft the update. She has been waiting since 14 Mar.', actions: [{ label: 'Draft update to Camilla', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Camilla Krogh updating her on the API integration resolution timeline. Include whatever option is being pursued (client OAuth migration or compatibility wrapper) and give her enough information to draft the client update email. Note that she has been waiting since 14 Mar.' }] }
      ]
    },
    'tech-2': {
      emoji: '⚙️', title: 'Data Migration Plan', status: 'On Track', statusColor: 'green',
      clickupId: 'data-migration-plan',
      description: 'Design and document the data migration strategy from the existing Danish system to the new platform.',
      dueDate: '30 Mar 2026', assignee: 'Sofie Andersen',
      documents: [{ name: '📄 Migration Strategy v1.4.pdf', href: '#' }, { name: '📄 Data Mapping Sheet.xlsx', href: '#' }],
      update: 'Migration dry run completed successfully with 99.7% data integrity.', updateDate: '10 Mar 2026',
      emails: [{ name: '💬 Dry Run Results — Sofie → Team', href: '#' }],
      todos: [
        { text: 'Address 0.3% data integrity gap from dry run', suggestion: 'The dry run showed 99.7% integrity. Identify the failing records and determine root cause — likely encoding or format mismatches similar to the Archive Migration (doc-3) encoding issues. Coordinate with Astrid Olsen who is dealing with the same problem.', actions: [{ label: 'Draft coordination email to Astrid', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Astrid Olsen and Sofie Andersen about the shared encoding issues. The Data Migration dry run showed 0.3% data integrity gap likely caused by the same encoding issues Astrid is facing with the Archive Migration (doc-3). Suggest they collaborate on a shared encoding fix.' }] },
        { text: 'Schedule production migration window', suggestion: 'Dry run passed, so begin planning the production cutover. Coordinate with Nils Christensen (environments are provisioned) and ensure the API integration blocker (tech-1) is resolved first, as the API feeds into the migration pipeline.', actions: [{ label: 'Draft migration plan email', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Sofie Andersen, Nils Christensen, and Lars Pedersen to coordinate the production migration window. Note that environments are provisioned (Nils) and dry run passed, but the API integration blocker must be resolved first. Propose tentative dates contingent on the API fix.' }] }
      ]
    },
    'tech-3': {
      emoji: '⚙️', title: 'Env. Provisioning', status: 'Completed', statusColor: 'blue',
      clickupId: 'env-provisioning',
      description: 'Provision staging and production environments for the Danish OI instance including security configurations.',
      dueDate: '1 Mar 2026', assignee: 'Nils Christensen',
      documents: [{ name: '📄 Infrastructure Runbook.pdf', href: '#' }, { name: '📄 Security Audit Report.pdf', href: '#' }],
      update: 'All environments provisioned and security audit passed. Handed off to dev team.', updateDate: '28 Feb 2026',
      emails: [{ name: '💬 Environments Ready — Nils → All', href: '#' }],
      todos: []
    },
    'leg-1': {
      emoji: '⚖️', title: 'GDPR Compliance Audit', status: 'Attention Needed', statusColor: 'amber',
      clickupId: 'gdpr-compliance-audit',
      description: 'Conduct a comprehensive GDPR compliance audit for all data processing activities related to the Danish operations.',
      dueDate: '22 Mar 2026', assignee: 'Katrine Møller',
      documents: [{ name: '📄 GDPR Audit Framework.pdf', href: '#' }, { name: '📄 Data Processing Register.xlsx', href: '#' }, { name: '📄 DPO Recommendations.docx', href: '#' }],
      update: 'DPO flagged two data processing activities that need additional legal basis documentation.', updateDate: '13 Mar 2026',
      emails: [{ name: '💬 Audit Findings — Katrine → Legal', href: '#' }, { name: '💬 Re: Data Processing Gaps — DPO', href: '#' }],
      todos: [
        { text: 'Document legal basis for the two flagged data processing activities', suggestion: 'The DPO flagged these on 13 Mar. Review the Data Processing Register to identify which activities lack a legal basis. Most likely candidates: legitimate interest or consent-based processing. Draft the legal basis documentation and have it reviewed before the 22 Mar deadline.', actions: [{ label: 'Research GDPR legal bases', icon: '🔍', type: 'research', instruction: 'Research GDPR Article 6 legal bases most applicable to data processing activities in a B2B SaaS context (legitimate interest vs consent). Provide clear guidance on which legal basis is most defensible for each of the two likely scenarios, with template language Katrine can use in the documentation.' }, { label: 'Draft legal basis document', icon: '📄', type: 'create_doc', instruction: 'Create a GDPR legal basis documentation template for the two flagged data processing activities. Include sections for: description of processing activity, legal basis justification (Article 6), legitimate interest assessment (if applicable), data subject rights impact, and DPO sign-off.' }] },
        { text: 'Assess impact on Vendor Onboarding Pack compliance section', suggestion: 'The Vendor Onboarding Pack (neg-3) has 2 items pending legal review — these are likely linked to this audit. Once the legal basis is documented, immediately update the vendor compliance requirements to match. Coordinate with Mette Hansen.', actions: [{ label: 'Draft alignment email to Mette', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to Mette Hansen explaining the GDPR audit findings and their impact on the Vendor Onboarding Pack compliance section. Ask her to hold on the 2 pending items until the legal basis documentation is finalized, then provide updated compliance requirements.' }] },
        { text: 'Update the Data Processing Register', suggestion: 'Ensure the register reflects the DPO recommendations and any remediation steps taken. This is a living document and needs to be current for the audit sign-off.', actions: [] }
      ]
    },
    'leg-2': {
      emoji: '⚖️', title: 'Contract Amendment', status: 'On Track', statusColor: 'green',
      clickupId: 'contract-amendment',
      description: 'Draft and finalize the contract amendment reflecting the updated scope of the Danish OI engagement.',
      dueDate: '2 Apr 2026', assignee: 'Frederik Jensen',
      documents: [{ name: '📄 Amendment Draft v2.0.docx', href: '#' }, { name: '📄 Scope Change Summary.pdf', href: '#' }],
      update: 'Amendment draft shared with client legal for review. Expecting feedback by end of week.', updateDate: '12 Mar 2026',
      emails: [{ name: '💬 Amendment Draft — Frederik → Client Legal', href: '#' }],
      todos: [
        { text: 'Follow up with client legal if no feedback by Friday 21 Mar', suggestion: 'Frederik sent the draft on 12 Mar. If no response by end of this week, send a polite follow-up. The amendment needs to reflect the SLA outcome (neg-2) — if the SLA is still under negotiation, the amendment may need a placeholder clause.', actions: [{ label: 'Draft follow-up email', icon: '✉️', type: 'draft_email', instruction: 'Draft a polite follow-up email from Frederik Jensen to client legal regarding the Contract Amendment Draft v2.0 sent on 12 Mar. Mention that we are awaiting their feedback and note that the SLA terms may need to be incorporated as an amendment once finalized. Keep it professional and non-pushy.' }] },
        { text: 'Incorporate SLA final terms once agreed', suggestion: 'The SLA Review (neg-2) is still in negotiation. The contract amendment should reference the agreed SLA terms. Keep a placeholder in v2.0 and plan for a v2.1 once the SLA is finalized.', actions: [] }
      ]
    },
    'doc-1': {
      emoji: '📄', title: 'Template Library', status: 'Completed', statusColor: 'blue',
      clickupId: 'template-library',
      description: 'Establish a standardized template library for all Danish project documentation including reports, briefs, and comms.',
      dueDate: '25 Feb 2026', assignee: 'Ida Rasmussen',
      documents: [{ name: '📄 Template Library Index.xlsx', href: '#' }, { name: '📄 Style Guide — Denmark.pdf', href: '#' }],
      update: 'Template library is live with 24 templates. Team onboarded and actively using the system.', updateDate: '24 Feb 2026',
      emails: [{ name: '💬 Templates Ready — Ida → All', href: '#' }],
      todos: []
    },
    'doc-2': {
      emoji: '📄', title: 'Version Control Policy', status: 'On Track', statusColor: 'green',
      clickupId: 'version-control-policy',
      description: 'Define and implement a version control policy for all critical project documents to ensure consistency.',
      dueDate: '18 Mar 2026', assignee: 'Magnus Nilsson',
      documents: [{ name: '📄 Version Control SOP.pdf', href: '#' }],
      update: 'Policy document finalized. Rollout training scheduled for next Monday.', updateDate: '11 Mar 2026',
      emails: [{ name: '💬 SOP Review — Magnus → Diego', href: '#' }],
      todos: [
        { text: 'Conduct rollout training session on Monday', suggestion: 'The SOP is finalized. Ensure all workstream leads attend the training. Particular focus on the Document Management and Legal teams who handle the most version-sensitive files. Use the Template Library (doc-1) Style Guide as a companion reference.', actions: [{ label: 'Draft training invite', icon: '📅', type: 'schedule_meeting', instruction: 'Schedule a Version Control Policy training session for Monday. Invite all workstream leads with special emphasis on Document Management and Legal teams. Include the Version Control SOP.pdf and Template Library Style Guide as pre-read materials. Duration: 45 minutes.' }, { label: 'Create training outline', icon: '📄', type: 'create_doc', instruction: 'Create a brief training session outline for the Version Control Policy rollout. Cover: 1) Policy overview, 2) Key rules for versioning documents, 3) Naming conventions, 4) How to use with the Template Library, 5) Q&A. Target 30-45 minutes.' }] },
        { text: 'Apply version control to active documents', suggestion: 'After training, prioritize applying the new policy to the Amendment Draft (leg-2) and SLA Framework (neg-2) which are actively being revised. These are the highest-risk documents for version confusion right now.', actions: [] }
      ]
    },
    'doc-3': {
      emoji: '📄', title: 'Archive Migration', status: 'Attention Needed', statusColor: 'amber',
      clickupId: 'archive-migration',
      description: 'Migrate historical project archives from the legacy file server to the new document management platform.',
      dueDate: '25 Mar 2026', assignee: 'Astrid Olsen',
      documents: [{ name: '📄 Archive Inventory.xlsx', href: '#' }, { name: '📄 Migration Script Output.log', href: '#' }],
      update: 'Migration script encountered errors on 12% of files due to encoding issues.', updateDate: '13 Mar 2026',
      emails: [{ name: '💬 Migration Errors — Astrid → IT Support', href: '#' }],
      todos: [
        { text: 'Fix encoding issues in migration script', suggestion: 'The 12% failure rate is likely caused by legacy files using non-UTF-8 encoding (ISO-8859-1 or Windows-1252). Ask IT Support for the error log analysis. A batch re-encoding step before migration should resolve most failures. Similar issue may affect the Data Migration (tech-2) — coordinate with Sofie Andersen.', actions: [{ label: 'Research encoding fix', icon: '🔍', type: 'research', instruction: 'Research best practices for batch re-encoding legacy files from ISO-8859-1/Windows-1252 to UTF-8 for migration scripts. Include common tools (iconv, Python codecs), edge cases to watch for, and a recommended approach for handling the 12% failure rate in the archive migration.' }, { label: 'Draft email to IT Support', icon: '✉️', type: 'draft_email', instruction: 'Draft an email to IT Support requesting an analysis of the migration script error log to identify which files failed and confirm the encoding issue diagnosis. Ask for the error log breakdown and whether they can implement a batch re-encoding step. Cc Astrid Olsen and mention coordination with Sofie Andersen on the Data Migration (tech-2) similar issue.' }] },
        { text: 'Re-run migration for failed files after script fix', suggestion: 'Once encoding is fixed, do a targeted re-run on just the 12% that failed. Verify 100% integrity before the 25 Mar deadline. Keep the Migration Script Output.log updated for audit trail.', actions: [] }
      ]
    },
    'com-1': {
      emoji: '💬', title: 'Steering Committee Brief', status: 'On Track', statusColor: 'green',
      clickupId: 'steering-committee-brief',
      description: 'Prepare the monthly steering committee briefing document summarizing project status, risks, and upcoming milestones.',
      dueDate: '20 Mar 2026', assignee: 'Mikkel Holm',
      documents: [{ name: '📄 SteerCo Brief — March 2026.pptx', href: '#' }, { name: '📄 Risk Register Update.xlsx', href: '#' }],
      update: 'March brief is 90% complete. Adding final risk commentary from legal team.', updateDate: '13 Mar 2026',
      emails: [{ name: '💬 SteerCo Prep — Mikkel → Diego', href: '#' }],
      todos: [
        { text: 'Add risk commentary from legal team re: GDPR audit findings', suggestion: 'The GDPR Compliance Audit (leg-1) has new findings — two data processing activities flagged by the DPO. Mikkel should include this as an amber risk item in the brief with Katrine\'s remediation timeline. Also mention the API Integration (tech-1) blocker as the top red risk.', actions: [{ label: 'Draft risk commentary', icon: '📄', type: 'create_doc', instruction: 'Draft a risk commentary section for the March SteerCo brief. Cover: (1) GDPR Audit — amber risk, two data processing activities flagged by DPO, remediation in progress with 22 Mar deadline. (2) API Integration — red risk, OAuth mismatch blocking integration, escalation to client CTO pending. Include impact assessment and mitigation actions for each.' }] },
        { text: 'Include API blocker escalation status', suggestion: 'The API Integration (tech-1) is the most critical risk for the SteerCo. Include the dependency chain: API blocker → Client Update Email delay. If an escalation to client CTO is planned, mention the expected resolution timeline.', actions: [{ label: 'Create dependency diagram', icon: '📊', type: 'create_doc', instruction: 'Create a simple dependency chain visualization showing: API Integration blocker → Client Update Email delay → potential SteerCo escalation. Include current status of each node and estimated resolution timeline. Format it as a clean one-pager for inclusion in the SteerCo brief.' }] },
        { text: 'Send to Diego for review before SteerCo', suggestion: 'Brief is 90% done. Target sending the final draft to Diego by 18 Mar for a 20 Mar meeting. Diego will want to see the risk items clearly prioritized and the overall 15% completion rate explained with the path to improvement.', actions: [{ label: 'Draft review request to Diego', icon: '✉️', type: 'draft_email', instruction: 'Draft an email from Mikkel Holm to Diego Ackermann sending the SteerCo Brief for review. Highlight the key risk items (API blocker as red, GDPR audit as amber), the 15% completion rate with context on the path to improvement, and request feedback by 19 Mar for the 20 Mar meeting.' }] }
      ]
    },
    'com-2': {
      emoji: '💬', title: 'Client Update Email', status: 'Blocked', statusColor: 'red',
      clickupId: 'client-update-email',
      description: 'Draft and send the bi-weekly client status update email. Currently blocked pending resolution of the API integration issue.',
      dueDate: '14 Mar 2026', assignee: 'Camilla Krogh',
      documents: [{ name: '📄 Client Update Template.docx', href: '#' }],
      update: 'Blocked: Cannot send client update until we have a resolution timeline for the API blocker.', updateDate: '14 Mar 2026',
      emails: [{ name: '💬 Update Delay — Camilla → Diego', href: '#' }, { name: '💬 Re: API Blocker Timeline — Lars', href: '#' }],
      todos: [
        { text: 'Get API resolution timeline from Lars Pedersen', suggestion: 'This email is overdue (due 14 Mar) and depends entirely on the API Integration (tech-1) blocker. Contact Lars for either: (a) the client CTO escalation outcome, or (b) the OAuth wrapper workaround timeline. Any answer lets Camilla draft the update.', actions: [{ label: 'Draft urgent ping to Lars', icon: '✉️', type: 'draft_email', instruction: 'Draft an urgent email to Lars Pedersen requesting an immediate update on the API integration resolution — either the client CTO escalation outcome or the OAuth compatibility wrapper timeline. Emphasize that the Client Update Email is overdue since 14 Mar and Camilla Krogh is blocked waiting for this information.' }] },
        { text: 'Draft interim update acknowledging the delay', suggestion: 'Rather than waiting indefinitely, Camilla could draft a shorter interim update that acknowledges the API delay, provides a timeline estimate, and highlights positive progress (Rate Card approved, Env. Provisioning complete, Migration dry run passed). This keeps client trust while buying time.', actions: [{ label: 'Draft interim client update', icon: '✉️', type: 'draft_email', instruction: 'Draft an interim client status update email that: (1) Acknowledges the API integration delay with an estimated resolution timeline, (2) Highlights positive progress — Rate Card approved by Finance, Environment Provisioning complete, Data Migration dry run passed with 99.7% integrity, (3) Outlines upcoming milestones (SteerCo brief 20 Mar, Contract Amendment). Tone: transparent but confident. Cc Diego.' }, { label: 'Create progress summary', icon: '📄', type: 'create_doc', instruction: 'Create a one-page project progress summary to attach to the interim client update. Include: overall status (15% complete, 2 tasks done), completed milestones, active workstreams with status, key risks with mitigation plans, and next 2-week outlook. Make it visually clean and professional.' }] },
        { text: 'Send the update once unblocked', suggestion: 'Use the Client Update Template.docx. Include: project overview (15% complete, 2 tasks done), key risks (API blocker + SLA negotiation), and upcoming milestones (SteerCo brief, Contract Amendment). Cc Diego on the send.', actions: [{ label: 'Draft full client update', icon: '✉️', type: 'draft_email', instruction: 'Draft the full bi-weekly client status update email using the Client Update Template format. Include: project overview (15% complete, 2 tasks done), key risks (API integration blocker resolution + SLA negotiation status), and upcoming milestones (SteerCo brief, Contract Amendment deadline). Cc Diego on the email.' }] }
      ]
    }
  };

  // ---- Navigation State ----
  // Level 0 = Country overview (all nodes visible, no filter)
  // Level 1 = Workstream view (filtered to a workstream via click)
  // Level 2 = Task detail (detail panel open)
  let navLevel = 0;
  let navWorkstream = null; // workstream id when at level 1+
  let navTask = null;       // task id when at level 2

  // ---- AU Team (from ClickUp) ----
  const AU_TEAM = [
    { username: 'Diego Ackermann', initials: 'DA', color: '#d60800' },
    { username: 'Esben Elmoe', initials: 'EE', color: '#622aea' },
    { username: 'Kristina Rudoman', initials: 'KR', color: '#5d4037' },
    { username: 'Rafe Usher-Harris', initials: 'RU', color: '#aa2fff' },
    { username: 'Sarai Alencar', initials: 'SA', color: '#1090e0' },
    { username: 'Will Kim', initials: 'WK', color: '#1b5e20' }
  ];
  // Expose for command bar
  window.AU_TEAM = AU_TEAM;

  // ---- DOM references ----
  const viewport = document.getElementById('mapViewport');
  const container = document.getElementById('mapContainer');
  const svg = document.getElementById('connectionsSvg');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  const detailClose = document.getElementById('detailClose');
  const detailOverlay = document.getElementById('detailOverlay');
  const completionFill = document.getElementById('completionFill');
  const completionText = document.getElementById('completionText');
  const clearFiltersBtn = document.getElementById('clearFilters');

  let panelOpen = false;
  let currentTask = null;
  let activeFilters = new Map();

  // ---- Create breadcrumb & back button ----
  const breadcrumbEl = document.createElement('div');
  breadcrumbEl.className = 'nav-breadcrumb';
  breadcrumbEl.innerHTML = '<span class="breadcrumb-item breadcrumb-root active">🇩🇰 Denmark</span>';
  document.body.appendChild(breadcrumbEl);

  const backBtn = document.createElement('button');
  backBtn.className = 'nav-back-btn';
  backBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  backBtn.title = 'Go back one level';
  document.body.appendChild(backBtn);

  // ---- Hover tooltip ----
  const tooltip = document.createElement('div');
  tooltip.className = 'node-tooltip';
  document.body.appendChild(tooltip);

  // ---- Mini-map ----
  const miniMap = document.createElement('div');
  miniMap.className = 'mini-map';
  miniMap.innerHTML = '<canvas id="miniMapCanvas" width="160" height="100"></canvas>';
  document.body.appendChild(miniMap);

  // ---- Create DOM nodes ----
  function makeNode(cls, innerHtml, delay) {
    const div = document.createElement('div');
    div.className = `node ${cls}`;
    div.innerHTML = `<div class="node-inner">${innerHtml}</div>`;
    div.style.animationDelay = (delay || 0) + 'ms';
    container.appendChild(div);
    return div;
  }

  // Central node
  const centralEl = makeNode('node--central', `
    <span class="node-flag">🇩🇰</span>
    <span class="node-title">Denmark — Danish OI</span>
    <span class="status-badge status-badge--phase">Implementation Phase</span>
  `, 0);

  // Build workstream and task nodes
  const wsEls = [];
  const taskEls = [];

  WORKSTREAMS.forEach((ws, wi) => {
    // Count statuses for badges
    const counts = { green: 0, amber: 0, red: 0, blue: 0 };
    ws.tasks.forEach(t => counts[t.status]++);
    const totalTasks = ws.tasks.length;
    const doneTasks = counts.blue;

    const wsColor = WS_COLORS[ws.id] || '#4f98a3';
    const wsEl = makeNode('node--workstream', `
      <span class="node-emoji">${ws.emoji}</span>
      <span class="node-title">${ws.title}</span>
      <span class="ws-badge">${doneTasks}/${totalTasks}</span>
      <span class="ws-status-dots">
        ${counts.red > 0 ? `<span class="ws-micro-dot ws-micro-dot--red">${counts.red}</span>` : ''}
        ${counts.amber > 0 ? `<span class="ws-micro-dot ws-micro-dot--amber">${counts.amber}</span>` : ''}
        ${counts.green > 0 ? `<span class="ws-micro-dot ws-micro-dot--green">${counts.green}</span>` : ''}
        ${counts.blue > 0 ? `<span class="ws-micro-dot ws-micro-dot--blue">${counts.blue}</span>` : ''}
      </span>
    `, 100 + wi * 80);
    wsEl.setAttribute('data-workstream', ws.id);
    // Apply unique WS outline color
    wsEl.querySelector('.node-inner').style.borderColor = wsColor;
    wsEls.push(wsEl);

    ws.tasks.forEach((task, ti) => {
      const taskEl = makeNode('node--task', `
        <span class="status-dot status-dot--${task.status}"></span>
        <span class="node-title">${task.title}</span>
        <span class="node-assignee">${task.assignee}</span>
        <span class="node-origin">${ws.emoji} ${ws.title}</span>
      `, 200 + wi * 80 + ti * 60);
      taskEl.setAttribute('data-task', task.id);
      taskEl.setAttribute('data-status', task.status);
      taskEl.setAttribute('data-workstream', ws.id);
      taskEls.push({ el: taskEl, wsIndex: wi, taskIndex: ti });
    });
  });

  // ---- Layout ----
  function layout() {
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;

    // Push workstreams further from center to leave room for tasks underneath
    const rxWs = Math.min(W * 0.38, 480);
    const ryWs = Math.min(H * 0.36, 340);

    centralEl.style.left = cx + 'px';
    centralEl.style.top = cy + 'px';

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    const wsPos = [];
    wsEls.forEach((el, i) => {
      const ws = WORKSTREAMS[i];
      const rad = (ws.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * rxWs;
      const y = cy + Math.sin(rad) * ryWs;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      wsPos.push({ x, y, angle: ws.angle });

      addLine(svg, cx, cy, x, y, 'connection-line--primary', `line-c-ws-${ws.id}`);
    });

    // Place tasks neatly UNDERNEATH their workstream title.
    // Each task stacks below the WS bubble, centered on the WS x position.
    const taskRowH = 48;
    const wsToTaskGap = 52; // vertical gap from WS center to first task center

    // Group tasks by workstream
    const wsTaskGroups = {};
    taskEls.forEach(tn => {
      if (!wsTaskGroups[tn.wsIndex]) wsTaskGroups[tn.wsIndex] = [];
      wsTaskGroups[tn.wsIndex].push(tn);
    });

    Object.keys(wsTaskGroups).forEach(wsIdx => {
      const idx = parseInt(wsIdx);
      const wp = wsPos[idx];
      const ws = WORKSTREAMS[idx];
      const tasks = wsTaskGroups[idx];

      // Tasks go directly below the WS title
      const anchorX = wp.x;
      const anchorY = wp.y + wsToTaskGap;

      tasks.sort((a, b) => a.taskIndex - b.taskIndex);
      tasks.forEach((tn, ti) => {
        let x = anchorX;
        let y = anchorY + ti * taskRowH;

        // Clamp to viewport
        x = Math.max(140, Math.min(W - 140, x));
        y = Math.max(170, Math.min(H - 80, y));

        tn.el.style.left = x + 'px';
        tn.el.style.top = y + 'px';

        addLine(svg, wp.x, wp.y, x, y, 'connection-line--secondary', `line-ws-${ws.id}-task-${ws.tasks[tn.taskIndex].id}`);
      });
    });

    updateMiniMap();
  }

  function addLine(svgEl, x1, y1, x2, y2, cls, lineId) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const len = Math.sqrt(dx * dx + dy * dy);
    const curvature = len * 0.1;
    const nx = -dy / len * curvature;
    const ny = dx / len * curvature;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${mx + nx} ${my + ny} ${x2} ${y2}`);
    path.classList.add('connection-line');
    if (cls) path.classList.add(cls);
    if (lineId) path.setAttribute('data-line-id', lineId);
    svgEl.appendChild(path);
  }

  // ---- Build Relationships HTML (extracted to avoid nested template literal issues) ----
  function buildRelationshipsHtml(taskId) {
    if (typeof getAllRelationships !== 'function') return '';
    const rels = getAllRelationships(taskId);
    if (rels.titleLinks.length + rels.taskLinks.length === 0) return '';
    var h = '<div class="detail-section detail-relationships-section">';
    h += '<div class="detail-rel-header">';
    h += '<h3 class="detail-section-title">Relationships</h3>';
    h += '<button class="detail-show-all-btn" data-task-id="' + taskId + '" title="View all related tasks">';
    h += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M8 3H3v5M16 21h5v-5M8 21H3v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg> View All';
    h += '</button></div>';
    if (rels.titleLinks.length > 0) {
      h += '<div class="detail-rel-group"><span class="detail-rel-group-label">Also belongs to</span>';
      rels.titleLinks.forEach(function(tl) {
        h += '<div class="detail-rel-item detail-rel-item--title"><span class="detail-rel-dot" style="background:' + tl.color + '"></span><span>' + tl.wsEmoji + ' ' + tl.wsTitle + '</span></div>';
      });
      h += '</div>';
    }
    if (rels.taskLinks.length > 0) {
      h += '<div class="detail-rel-group"><span class="detail-rel-group-label">Linked tasks</span>';
      rels.taskLinks.forEach(function(lnk) {
        var ws = WORKSTREAMS.find(function(w) { return w.id === lnk.wsId; });
        h += '<button class="detail-rel-item detail-rel-item--task" data-rel-from="' + taskId + '" data-rel-to="' + lnk.taskId + '">';
        h += '<span class="detail-rel-dot" style="background:' + lnk.color + '"></span>';
        h += '<span class="detail-rel-task-name">' + lnk.emoji + ' ' + lnk.title + '</span>';
        h += '<span class="detail-rel-label">' + lnk.label + '</span>';
        if (ws) h += '<span class="detail-rel-ws">' + ws.emoji + '</span>';
        h += '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  // ---- Detail Panel ----
  function openPanel(taskId, opts) {
    opts = opts || {};
    const data = TASK_DATA[taskId];
    if (!data) return;
    currentTask = taskId;
    panelOpen = true;

    // Find which workstream this task belongs to
    let wsId = null;
    WORKSTREAMS.forEach(ws => {
      ws.tasks.forEach(t => { if (t.id === taskId) wsId = ws.id; });
    });
    navLevel = 2;
    navTask = taskId;
    if (wsId) navWorkstream = wsId;
    updateBreadcrumb();

    const labels = { green: 'On Track', amber: 'Attention Needed', red: 'Blocked', blue: 'Completed' };

    // Build To-Do section HTML
    let todosHtml = '';
    if (data.todos && data.todos.length > 0) {
      todosHtml = `
        <div class="detail-section detail-todo-section">
          <h3 class="detail-section-title detail-todo-header">
            <span class="detail-todo-icon">☑️</span>
            To-Do
            <span class="detail-todo-count">${data.todos.length}</span>
          </h3>
          <div class="detail-todo-list">
            ${data.todos.map((todo, i) => `
              <div class="detail-todo-item" data-todo-index="${i}" data-task-id="${taskId}">
                <span class="detail-todo-check" data-task-id="${taskId}" data-todo-index="${i}" role="checkbox" aria-checked="false" tabindex="0">
                  <svg class="todo-check-empty" width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                  <svg class="todo-check-filled" width="14" height="14" viewBox="0 0 14 14" fill="none" style="display:none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.3"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <button class="detail-todo-toggle" aria-expanded="false" aria-controls="todo-suggestion-${taskId}-${i}">
                  <span class="detail-todo-text">${todo.text}</span>
                  <span class="detail-todo-chevron">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M4 5L6 7L8 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
                <div class="detail-todo-suggestion" id="todo-suggestion-${taskId}-${i}">
                  <div class="detail-todo-suggestion-inner">
                    <span class="detail-todo-suggestion-label">💡 Suggested Action</span>
                    <p class="detail-todo-suggestion-text">${todo.suggestion}</p>
                    ${(todo.actions && todo.actions.length > 0) ? `
                      <div class="todo-actions">
                        <span class="todo-actions-label">Perplexity can help:</span>
                        <div class="todo-actions-list">
                          ${todo.actions.map((action, ai) => `
                            <button class="todo-action-btn" data-task-id="${taskId}" data-todo-index="${i}" data-action-index="${ai}" data-action-type="${action.type}">
                              <span class="todo-action-icon">${action.icon}</span>
                              <span class="todo-action-label">${action.label}</span>
                              <span class="todo-action-arrow">
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M3 1L7 5L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                              </span>
                            </button>
                          `).join('')}
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ClickUp URL (using workspace ID and task slug)
    const clickupUrl = data.clickupId
      ? `https://app.clickup.com/9015438153/v/li/${data.clickupId}`
      : '#';

    detailContent.innerHTML = `
      <div class="detail-header">
        <span class="detail-emoji">${data.emoji}</span>
        <h2 class="detail-title">${data.title}</h2>
        <span class="detail-status">
          <span class="status-dot status-dot--${data.statusColor}"></span>
          ${labels[data.statusColor] || data.status}
        </span>
      </div>
      <div class="detail-actions-bar">
        ${data.clickupId ? `
          <a href="${clickupUrl}" target="_blank" rel="noopener noreferrer" class="detail-ext-btn detail-ext-btn--clickup">
            <svg class="clickup-logo" width="16" height="16" viewBox="0 0 128 128" fill="none">
              <path d="M20.48 87.04l19.84-15.2c11.52 15.04 22.72 22.08 39.68 22.08 17.12 0 28.96-7.36 40-21.76L139.84 87.2C123.84 108.48 106.72 120 80 120c-26.56 0-44.16-11.52-59.52-32.96z" fill="#7B68EE" transform="scale(0.85) translate(8,5)"/>
              <path d="M80 54.4l-24.64 21.12L40 56.96l40-34.56 40 34.56-15.36 18.56L80 54.4z" fill="#49CCF9" transform="scale(0.85) translate(8,5)"/>
            </svg>
            View in ClickUp
          </a>
        ` : ''}
        <button class="detail-ext-btn detail-ext-btn--perplexity" data-task-id="${taskId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Continue in Perplexity
          <span class="perplexity-mode-arrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4L5 6L7 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
      </div>
      <div class="detail-meta">
        <div class="detail-meta-item">
          <span class="detail-meta-label">Assignee</span>
          <span class="detail-meta-value">${data.assignee}</span>
        </div>
        <div class="detail-meta-item">
          <span class="detail-meta-label">Due Date</span>
          <span class="detail-meta-value">${data.dueDate}</span>
        </div>
      </div>
      ${buildNotifSectionHtml(taskId)}
      ${todosHtml}
      <div class="detail-section">
        <h3 class="detail-section-title">Description</h3>
        <p class="detail-text">${data.description}</p>
      </div>
      <div class="detail-section">
        <h3 class="detail-section-title">Latest Update</h3>
        <div class="detail-update">
          ${data.update}
          <div class="detail-update-date">${data.updateDate}</div>
        </div>
      </div>
      <div class="detail-section">
        <h3 class="detail-section-title">Related Documents</h3>
        <ul class="detail-links">
          ${data.documents.map(d => `<li><a href="${d.href}" class="detail-link" onclick="event.preventDefault()"><span class="detail-link-icon">📎</span>${d.name}</a></li>`).join('')}
        </ul>
      </div>
      <div class="detail-section">
        <h3 class="detail-section-title">Related Communications</h3>
        <ul class="detail-links">
          ${data.emails.map(e => `<li><a href="${e.href}" class="detail-link" onclick="event.preventDefault()"><span class="detail-link-icon">✉️</span>${e.name}</a></li>`).join('')}
        </ul>
      </div>
      ${buildRelationshipsHtml(taskId)}
    `;

    // Bind todo toggle clicks
    detailContent.querySelectorAll('.detail-todo-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const item = btn.closest('.detail-todo-item');
        const isExpanded = item.classList.contains('expanded');
        // Close all others first
        detailContent.querySelectorAll('.detail-todo-item.expanded').forEach(el => {
          if (el !== item) el.classList.remove('expanded');
        });
        item.classList.toggle('expanded', !isExpanded);
        btn.setAttribute('aria-expanded', !isExpanded);
      });
    });

    // Bind action button clicks
    detailContent.querySelectorAll('.todo-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tId = btn.dataset.taskId;
        const todoIdx = parseInt(btn.dataset.todoIndex, 10);
        const actionIdx = parseInt(btn.dataset.actionIndex, 10);
        const todo = TASK_DATA[tId].todos[todoIdx];
        const action = todo.actions[actionIdx];
        showActionWorkspacePanel(action, todo, TASK_DATA[tId]);
      });
    });

    // Bind todo checkbox clicks
    detailContent.querySelectorAll('.detail-todo-check').forEach(chk => {
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const tId = chk.dataset.taskId;
        const idx = parseInt(chk.dataset.todoIndex, 10);
        const item = chk.closest('.detail-todo-item');
        const isChecked = item.classList.toggle('todo-checked');
        chk.setAttribute('aria-checked', String(isChecked));
        chk.querySelector('.todo-check-empty').style.display = isChecked ? 'none' : '';
        chk.querySelector('.todo-check-filled').style.display = isChecked ? '' : 'none';
        const key = tId + ':' + idx;
        todoCheckedState[key] = isChecked;
        saveTodoState();
      });
    });

    // Apply loaded todo checked states
    loadTodoState().then(() => {
      detailContent.querySelectorAll('.detail-todo-check').forEach(chk => {
        const key = chk.dataset.taskId + ':' + chk.dataset.todoIndex;
        if (todoCheckedState[key]) {
          const item = chk.closest('.detail-todo-item');
          item.classList.add('todo-checked');
          chk.setAttribute('aria-checked', 'true');
          chk.querySelector('.todo-check-empty').style.display = 'none';
          chk.querySelector('.todo-check-filled').style.display = '';
        }
      });
    });

    // Bind notification item clicks — dismiss badge + open link
    detailContent.querySelectorAll('.panel-notif-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var nTaskId = item.getAttribute('data-notif-task');
        var notifHref = item.getAttribute('data-notif-href');
        if (notifHref && notifHref !== '#' && !notifHref.startsWith('#')) {
          window.open(notifHref, '_blank', 'noopener,noreferrer');
        }
        // Animate the item out
        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease';
        item.style.opacity = '0';
        item.style.transform = 'translateX(10px)';
        item.style.maxHeight = '0';
        item.style.overflow = 'hidden';
        item.style.marginBottom = '0';
        item.style.padding = '0';
        // Dismiss the badge on the map
        dismissNotifBadge(nTaskId);
        // Remove the section after animation if no items left
        setTimeout(function() {
          item.remove();
          var section = detailContent.querySelector('[data-notif-section="' + nTaskId + '"]');
          if (section && section.querySelectorAll('.panel-notif-item').length === 0) {
            section.style.transition = 'opacity 0.3s ease, max-height 0.3s ease';
            section.style.opacity = '0';
            section.style.maxHeight = '0';
            setTimeout(function() { section.remove(); }, 300);
          }
        }, 350);
      });
    });

    // Bind relationship task clicks (opens comparison view)
    detailContent.querySelectorAll('.detail-rel-item--task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const from = btn.dataset.relFrom;
        const to = btn.dataset.relTo;
        if (from && to) openComparisonView(from, to);
      });
    });

    // Bind "View All" button in relationships section
    detailContent.querySelectorAll('.detail-show-all-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tId = btn.dataset.taskId;
        if (tId) openAllRelatedView(tId);
      });
    });

    // Bind "Continue in Perplexity" button
    const pplxBtn = detailContent.querySelector('.detail-ext-btn--perplexity');
    if (pplxBtn) {
      pplxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPerplexityModeDropdown(pplxBtn, taskId, data);
      });
    }

    detailPanel.classList.add('active');

    // If opened from the AI answer panel (opts.fromAnswer), skip overlay so both panels coexist
    if (!opts.fromAnswer) {
      detailOverlay.classList.add('active');
    }

    // If opened from notification badge, scroll to notification section and pulsate items
    if (opts.scrollToNotif) {
      setTimeout(function() {
        var notifSection = detailContent.querySelector('[data-notif-section="' + taskId + '"]');
        if (notifSection) {
          notifSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add pulsating highlight to notification items
          notifSection.querySelectorAll('.panel-notif-item').forEach(function(item) {
            item.classList.add('notif-item-pulsate');
            setTimeout(function() { item.classList.remove('notif-item-pulsate'); }, 3000);
          });
        }
      }, 350);
    }
  }

  // Expose openPanel globally so command-bar.js can call it
  window.openPanel = openPanel;

  // ---- Action Workspace Panel ----
  function showActionWorkspacePanel(action, todo, taskData) {
    // Remove existing panel if any
    const existing = document.querySelector('.action-confirm-overlay');
    if (existing) existing.remove();

    const typeLabels = {
      draft_email: 'Draft Email',
      create_doc: 'Create Document',
      schedule_meeting: 'Schedule Meeting',
      research: 'Research',
      prepare_qa: 'Prepare Q&A'
    };

    const typeIcons = {
      draft_email: '✉️',
      create_doc: '📄',
      schedule_meeting: '📅',
      research: '🔍',
      prepare_qa: '❓'
    };

    const isEmail = action.type === 'draft_email';
    const isDoc = action.type === 'create_doc';
    const isChat = action.type === 'send_chat';
    const isMeeting = action.type === 'schedule_meeting';

    // Simulated draft content based on instruction
    const mockDraft = generateMockDraft(action, todo, taskData);

    const overlay = document.createElement('div');
    overlay.className = 'action-confirm-overlay';

    // Build the content area based on type
    let contentHtml = '';
    if (isEmail) {
      contentHtml = buildEmailComposer(action, todo, taskData, mockDraft);
    } else if (isDoc) {
      contentHtml = buildDocumentViewer(action, todo, taskData, mockDraft);
    } else {
      contentHtml = buildGenericWorkspace(action, todo, taskData, mockDraft);
    }

    overlay.innerHTML = `
      <div class="action-confirm-modal action-workspace">
        <div class="action-workspace-header">
          <div class="action-workspace-title-row">
            <span class="action-workspace-icon">${action.icon}</span>
            <h3 class="action-workspace-title">${action.label}</h3>
            <span class="action-confirm-type">${typeLabels[action.type] || action.type}</span>
          </div>
          <div class="action-workspace-context">
            <span>${taskData.emoji} ${taskData.title}</span>
            <span class="action-workspace-sep">›</span>
            <span class="action-workspace-todo-ref">${todo.text}</span>
          </div>
          <button class="action-workspace-close" aria-label="Close">×</button>
        </div>
        ${contentHtml}
        <div class="action-workspace-footer">
          <div class="action-workspace-footer-left">
            <button class="detail-ext-btn detail-ext-btn--perplexity action-workspace-pplx" data-task-id="${taskData.title}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Continue in Perplexity
            </button>
          </div>
          <div class="action-workspace-footer-right">
            <button class="action-workspace-btn action-workspace-btn--secondary action-workspace-discard">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    // --- Event Bindings ---
    // Close
    overlay.querySelector('.action-workspace-close').addEventListener('click', () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 250);
      }
    });

    // Discard
    overlay.querySelector('.action-workspace-discard').addEventListener('click', () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
    });

    // --- Revision Chat removed (Phase 2 — no /api/revise backend) ---
    const chatForm = null;
    const chatInput = null;
    const chatMessages = null;
    const chatKey = null;

    // Revision chat history restore disabled
    if (false && chatMessages) {
      chatMessages.innerHTML = '';
      revisionChatHistory[chatKey].forEach(entry => {
        const bubble = document.createElement('div');
        bubble.className = `revision-chat-msg revision-chat-msg--${entry.role}`;
        bubble.innerHTML = entry.html || '';
        bubble.textContent = bubble.textContent ? '' : '';
        bubble.innerHTML = entry.html;
        chatMessages.appendChild(bubble);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      // Initialize with welcome message
      revisionChatHistory[chatKey] = [{
        role: 'ai',
        html: isEmail
          ? 'Here\'s the draft based on the task context. Let me know if you\'d like any changes — tone, recipients, details, length.'
          : isDoc
          ? 'Here\'s the document draft. You can review it above, expand for full view, or tell me what to change.'
          : 'Here\'s what I\'ve prepared. Tell me if you\'d like any adjustments.'
      }];
    }

    if (chatForm && chatInput) {
      // Helper: show typing indicator and return remove function
      function showTyping() {
        const typingBubble = document.createElement('div');
        typingBubble.className = 'revision-chat-msg revision-chat-msg--ai revision-typing';
        typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span> Applying changes...';
        chatMessages.appendChild(typingBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return () => typingBubble.remove();
      }

      // Helper: add AI response bubble
      function addAIBubble(html) {
        const aiBubble = document.createElement('div');
        aiBubble.className = 'revision-chat-msg revision-chat-msg--ai';
        aiBubble.innerHTML = html;
        chatMessages.appendChild(aiBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        revisionChatHistory[chatKey].push({ role: 'ai', html });
      }

      // Helper: call API and show result
      async function executeRevision(msg, mode) {
        const removeTyping = showTyping();
        // Disable input while processing
        chatInput.disabled = true;
        chatForm.querySelector('.revision-chat-send').disabled = true;

        try {
          const result = await applyRevisionToContent(overlay, msg, mode, isEmail, isDoc);
          removeTyping();

          if (result && result.success) {
            const modeLabel = mode === 'search' ? '🔍 Search' : '💻 Computer';
            addAIBubble(`Done via ${modeLabel} — I've updated the draft above. Review the changes.`);
          } else {
            const errorMsg = (result && result.error) || 'Something went wrong';
            addAIBubble(`⚠️ Couldn't apply that change: ${errorMsg}. Try rephrasing your request.`);
          }
        } catch (err) {
          removeTyping();
          addAIBubble('⚠️ Connection error. Please try again.');
        } finally {
          chatInput.disabled = false;
          chatForm.querySelector('.revision-chat-send').disabled = false;
          chatInput.focus();
        }
      }

      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = chatInput.value.trim();
        if (!msg) return;

        // Add user message
        const userBubble = document.createElement('div');
        userBubble.className = 'revision-chat-msg revision-chat-msg--user';
        userBubble.textContent = msg;
        chatMessages.appendChild(userBubble);
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Save to history
        revisionChatHistory[chatKey].push({ role: 'user', html: msg });

        if (isDoc) {
          // DOCUMENT: Show mode choice buttons
          const choiceBubble = document.createElement('div');
          choiceBubble.className = 'revision-chat-msg revision-chat-msg--ai';
          choiceBubble.innerHTML = `
            <span>How should I apply this change?</span>
            <div class="revision-mode-choice">
              <button class="revision-mode-btn revision-mode-btn--search" data-mode="search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Search <span class="revision-mode-sub">Quick edit</span>
              </button>
              <button class="revision-mode-btn revision-mode-btn--computer" data-mode="computer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Computer <span class="revision-mode-sub">Deep rewrite</span>
              </button>
            </div>
          `;
          chatMessages.appendChild(choiceBubble);
          chatMessages.scrollTop = chatMessages.scrollHeight;

          revisionChatHistory[chatKey].push({ role: 'ai', html: choiceBubble.innerHTML });

          // Bind mode buttons
          choiceBubble.querySelectorAll('.revision-mode-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const mode = btn.dataset.mode;
              // Disable both buttons
              choiceBubble.querySelectorAll('.revision-mode-btn').forEach(b => b.disabled = true);
              btn.classList.add('selected');
              await executeRevision(msg, mode);
            });
          });
        } else {
          // EMAIL / CHAT / GENERIC: Auto-apply using Search mode
          executeRevision(msg, 'search');
        }
      });
    }

    // Download dropdown for documents
    const dlBtn = overlay.querySelector('.action-workspace-download');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDownloadDropdown(dlBtn, action);
      });
    }

    // Send email - show success
    const sendBtn = overlay.querySelector('.action-workspace-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        showWorkspaceSuccess(overlay, 'Email sent successfully', action.label);
      });
    }

    // Copy button
    const copyBtn = overlay.querySelector('.action-workspace-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy Result`;
        }, 2000);
      });
    }

    // Continue in Perplexity button
    const pplxWorkspaceBtn = overlay.querySelector('.action-workspace-pplx');
    if (pplxWorkspaceBtn) {
      pplxWorkspaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Grab the exact current draft content (plain text)
        const contentEl = overlay.querySelector('.email-draft-content, .doc-viewer-content, .generic-result-content');
        const currentDraft = contentEl ? contentEl.innerText : '';
        // Build a prompt that preserves the exact draft and asks for input
        const prompt = `Here is my current ${isEmail ? 'email' : isDoc ? 'document' : 'content'} draft for "${action.label}" (task: ${taskData.title}). Do NOT change anything yet. Show me the draft exactly as-is and ask me what changes I'd like to make.\n\n---\n${currentDraft}\n---`;
        showPerplexityModeDropdown(pplxWorkspaceBtn, taskData.title, {
          title: action.label,
          description: prompt
        });
      });
    }

    // Schedule meeting button
    const schedBtn = overlay.querySelector('.action-workspace-schedule');
    if (schedBtn) {
      schedBtn.addEventListener('click', () => {
        showWorkspaceSuccess(overlay, 'Meeting scheduled', action.label);
      });
    }

    // ESC to close
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 250);
        document.removeEventListener('keydown', onEsc);
      }
    };
    document.addEventListener('keydown', onEsc);
  }

  // --- Apply Revision to Content (Real AI via /api/revise) ---
  async function applyRevisionToContent(overlay, userMsg, mode, isEmail, isDoc) {
    // Find the editable content element
    let contentEl = null;
    if (isEmail) {
      contentEl = overlay.querySelector('.email-draft-content');
    } else if (isDoc) {
      contentEl = overlay.querySelector('.doc-viewer-content');
    } else {
      contentEl = overlay.querySelector('.generic-result-content');
    }
    if (!contentEl) return;

    const currentHTML = contentEl.innerHTML;

    // Visual: dim content and show updating state
    contentEl.style.transition = 'opacity 0.3s ease';
    contentEl.style.opacity = '0.45';
    contentEl.style.pointerEvents = 'none';

    // Add a subtle shimmer overlay
    const shimmer = document.createElement('div');
    shimmer.className = 'revision-shimmer';
    contentEl.parentElement.style.position = 'relative';
    contentEl.parentElement.appendChild(shimmer);

    try {
      const contentType = isEmail ? 'email' : isDoc ? 'document' : 'generic';

      const resp = await fetch(API_BASE + '/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentContent: currentHTML,
          userRequest: userMsg,
          contentType,
          mode
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Revision request failed');
      }

      const data = await resp.json();

      // Animate the content swap with a smooth crossfade
      contentEl.style.opacity = '0';
      await new Promise(r => setTimeout(r, 200));
      contentEl.innerHTML = data.revisedContent;
      contentEl.style.opacity = '1';

      // Brief highlight to show it changed
      const highlightColor = mode === 'search'
        ? 'rgba(32, 178, 170, 0.08)'
        : 'rgba(110, 90, 230, 0.08)';
      contentEl.style.transition = 'opacity 0.3s ease, background-color 0.4s ease';
      contentEl.style.backgroundColor = highlightColor;
      setTimeout(() => { contentEl.style.backgroundColor = ''; }, 1500);

      return { success: true };

    } catch (err) {
      console.error('Revision failed:', err);
      // Restore original content on error
      contentEl.style.opacity = '1';
      return { success: false, error: err.message };

    } finally {
      contentEl.style.pointerEvents = '';
      shimmer.remove();
    }
  }

  // --- Email Composer Builder ---
  function buildEmailComposer(action, todo, taskData, mockDraft) {
    const recipients = extractRecipients(action.instruction);
    const toStr = recipients.to.join(', ');
    const ccStr = recipients.cc.join(', ');
    const plainBody = mockDraft.body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(toStr) + '&cc=' + encodeURIComponent(ccStr) + '&su=' + encodeURIComponent(mockDraft.subject) + '&body=' + encodeURIComponent(plainBody);
    return `
      <div class="action-workspace-body">
        <div class="action-workspace-main action-workspace-main--full">
          <div class="quick-action-card">
            <div class="quick-action-preview">
              <div class="quick-action-meta"><span class="quick-action-meta-label">To</span><span class="quick-action-meta-value">${recipients.to.map(r => '<span class="email-chip">' + r + '</span>').join('')}</span></div>
              ${recipients.cc.length > 0 ? '<div class="quick-action-meta"><span class="quick-action-meta-label">Cc</span><span class="quick-action-meta-value">' + recipients.cc.map(r => '<span class="email-chip">' + r + '</span>').join('') + '</span></div>' : ''}
              <div class="quick-action-meta"><span class="quick-action-meta-label">Subject</span><span class="quick-action-meta-value">${mockDraft.subject}</span></div>
              <div class="quick-action-body-preview">${mockDraft.body}</div>
            </div>
            <a href="${gmailUrl}" target="_blank" rel="noopener noreferrer" class="quick-action-launch-btn quick-action-launch-btn--gmail">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 6l-10 7L2 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Open in Gmail
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // --- Document Viewer Builder ---
  function buildDocumentViewer(action, todo, taskData, mockDraft) {
    return `
      <div class="action-workspace-body">
        <div class="action-workspace-main action-workspace-main--full">
          <div class="quick-action-card">
            <div class="quick-action-preview">
              <div class="doc-preview-card">
                <div class="doc-preview-icon">📄</div>
                <div class="doc-preview-info">
                  <span class="doc-preview-filename">${mockDraft.filename}</span>
                  <span class="doc-preview-desc">${action.instruction}</span>
                </div>
              </div>
              ${mockDraft.visualSuggestion ? '<div class="doc-visual-hint"><span class="doc-visual-hint-icon">🎨</span><span>' + mockDraft.visualSuggestion + '</span></div>' : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Generic Workspace Builder (research, meetings, etc.) ---
  function buildGenericWorkspace(action, todo, taskData, mockDraft) {
    return `
      <div class="action-workspace-body">
        <div class="action-workspace-main action-workspace-main--full">
          <div class="quick-action-card">
            <div class="quick-action-preview">
              <div class="generic-result-content">${mockDraft.body}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Mock Draft Generator ---
  function generateMockDraft(action, todo, taskData) {
    if (action.type === 'draft_email') {
      // Build a natural-sounding email from the instruction context
      const recipients = extractRecipients(action.instruction);
      const firstName = recipients.to[0] ? recipients.to[0].split(' ')[0] : 'Team';
      const subject = `Re: ${taskData.title} — ${todo.text}`;

      // Generate contextual email body based on the instruction
      let body = `<p>Hi ${firstName},</p>`;

      // Smart body generation based on instruction keywords
      const inst = action.instruction.toLowerCase();
      if (inst.includes('sign-off') || inst.includes('approval')) {
        body += `<p>I'm reaching out regarding the <strong>${taskData.title}</strong>. ${taskData.update || ''}</p>`;
        body += `<p>Could you please review and confirm your sign-off at your earliest convenience? All necessary validations have been completed and we're ready to move forward.</p>`;
      } else if (inst.includes('coordinate') || inst.includes('include') || inst.includes('asking')) {
        body += `<p>Quick update on <strong>${taskData.title}</strong> — we're making good progress and I wanted to coordinate on the next steps.</p>`;
        body += `<p>${action.instruction.replace(/^Draft an email to [^.]+\./i, '').replace(/^Draft a[n]? (?:email|message) to [^.]+\./i, '').trim()}</p>`;
      } else if (inst.includes('request') || inst.includes('assessment') || inst.includes('feasibility')) {
        body += `<p>We need your input on <strong>${taskData.title}</strong>. The current status is: ${taskData.status}.</p>`;
        body += `<p>Could you provide an assessment on this? ${todo.text} is the key action item we need to address.</p>`;
      } else if (inst.includes('follow up') || inst.includes('update')) {
        body += `<p>Following up on <strong>${taskData.title}</strong>. I wanted to check on the current status and see if there are any blockers we should address.</p>`;
      } else {
        body += `<p>I'm writing regarding <strong>${taskData.title}</strong> — specifically about: ${todo.text.toLowerCase()}.</p>`;
      }

      if (taskData.dueDate) {
        body += `<p>As a reminder, the due date for this item is <strong>${taskData.dueDate}</strong>.</p>`;
      }
      body += `<p>Let me know if you have any questions.</p>`;
      body += `<p>Best regards,<br/>Diego Ackermann</p>`;

      return { subject, body };
    } else if (action.type === 'create_doc') {
      const hasVisual = action.instruction.toLowerCase().includes('diagram') ||
                        action.instruction.toLowerCase().includes('visualization') ||
                        action.instruction.toLowerCase().includes('template') ||
                        action.instruction.toLowerCase().includes('comparison');
      return {
        filename: `${taskData.title.replace(/\s+/g, '_')}_Draft.docx`,
        body: `<h3>${action.label}</h3><p>${action.instruction}</p><p style="color: var(--color-text-faint); font-style: italic;">Full document content will be generated by Perplexity based on the instruction above and all available project context.</p>`,
        visualSuggestion: hasVisual ? `A visual element would strengthen this document. Consider adding a comparison table or flowchart to illustrate the key points. Perplexity can generate this for you.` : null,
      };
    } else {
      return {
        body: `<h3>${action.label}</h3><p>${action.instruction}</p><p style="color: var(--color-text-faint); font-style: italic;">Perplexity will generate the full result based on the instruction and project context.</p>`,
      };
    }
  }

  // --- Extract Recipients from instruction ---
  function extractRecipients(instruction) {
    // Known team members from task data
    const knownNames = [
      'Diego Ackermann', 'Anna Sørensen', 'Erik Lindqvist', 'Mette Hansen',
      'Lars Pedersen', 'Sofie Andersen', 'Nils Christensen', 'Katrine Møller',
      'Frederik Jensen', 'Ida Rasmussen', 'Magnus Nilsson', 'Astrid Olsen',
      'Mikkel Holm', 'Camilla Krogh'
    ];
    const found = [];
    const instructionLower = instruction.toLowerCase();
    knownNames.forEach(name => {
      if (instructionLower.includes(name.toLowerCase())) {
        found.push(name);
      }
    });
    // Determine To vs CC based on instruction phrasing
    const to = found.length > 0 ? found : ['Recipient'];
    // Diego is CC'd if he's not the primary recipient
    const cc = !to.some(n => n.includes('Diego')) ? ['Diego Ackermann'] : [];
    return { to, cc };
  }

  // --- Download Dropdown ---
  function showDownloadDropdown(btn, action) {
    const existing = document.querySelector('.download-dropdown');
    if (existing) { existing.remove(); return; }

    const isSpreadsheet = action.instruction.toLowerCase().includes('spreadsheet') || action.instruction.toLowerCase().includes('register');
    const isPresentation = action.instruction.toLowerCase().includes('presentation') || action.instruction.toLowerCase().includes('slides');

    let formats = [];
    if (isSpreadsheet) {
      formats = [
        { label: 'Google Sheets', icon: '🟢', ext: '.gsheet' },
        { label: 'Excel (.xlsx)', icon: '📊', ext: '.xlsx' },
        { label: 'CSV (.csv)', icon: '📄', ext: '.csv' },
        { label: 'PDF (.pdf)', icon: '🔴', ext: '.pdf' },
      ];
    } else if (isPresentation) {
      formats = [
        { label: 'Google Slides', icon: '🟡', ext: '.gslides' },
        { label: 'PowerPoint (.pptx)', icon: '📊', ext: '.pptx' },
        { label: 'PDF (.pdf)', icon: '🔴', ext: '.pdf' },
      ];
    } else {
      formats = [
        { label: 'Google Docs', icon: '🔵', ext: '.gdoc' },
        { label: 'Word (.docx)', icon: '📄', ext: '.docx' },
        { label: 'PDF (.pdf)', icon: '🔴', ext: '.pdf' },
        { label: 'Markdown (.md)', icon: '🗒️', ext: '.md' },
      ];
    }

    const dd = document.createElement('div');
    dd.className = 'download-dropdown';
    dd.innerHTML = formats.map(f => `
      <button class="download-dropdown-item" data-ext="${f.ext}">
        <span class="download-dropdown-icon">${f.icon}</span>
        ${f.label}
      </button>
    `).join('');

    btn.style.position = 'relative';
    btn.appendChild(dd);
    requestAnimationFrame(() => dd.classList.add('open'));

    dd.querySelectorAll('.download-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        dd.classList.remove('open');
        setTimeout(() => dd.remove(), 200);
        // Show brief confirmation
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Downloading...`;
        setTimeout(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Download`;
        }, 1500);
      });
    });

    // Close on outside click
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!dd.contains(e.target) && e.target !== btn) {
          dd.classList.remove('open');
          setTimeout(() => dd.remove(), 200);
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  // --- Workspace Success State ---
  function showWorkspaceSuccess(overlay, message, detail) {
    const modal = overlay.querySelector('.action-workspace');
    modal.innerHTML = `
      <div class="action-confirm-success">
        <div class="action-success-checkmark">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="var(--color-green)" stroke-width="2" fill="rgba(74,222,128,0.08)"/>
            <path d="M14 24L21 31L34 16" stroke="var(--color-green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="checkmark-path"/>
          </svg>
        </div>
        <h3 class="action-success-title">${message}</h3>
        <p class="action-success-text">${detail}</p>
      </div>
    `;
    setTimeout(() => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
    }, 2000);
  }

  // --- Perplexity Mode Dropdown ---
  function showPerplexityModeDropdown(btn, taskId, taskData) {
    const existing = document.querySelector('.pplx-mode-dropdown');
    if (existing) { existing.remove(); return; }

    const desc = (taskData.description || '').substring(0, 1500);
    const searchUrl = `https://www.perplexity.ai/?q=${encodeURIComponent(desc || taskData.title)}`;
    const computerUrl = `https://www.perplexity.ai/computer?q=${encodeURIComponent(desc || taskData.title)}`;

    const dd = document.createElement('div');
    dd.className = 'pplx-mode-dropdown';
    dd.innerHTML = `
      <div class="pplx-mode-item" data-url="${searchUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <div><strong>Search</strong><span>Quick research and answers</span></div>
      </div>
      <div class="pplx-mode-item" data-url="${computerUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <div><strong>Computer</strong><span>Full task execution</span></div>
      </div>
    `;

    // Use window.open for iframe compatibility
    dd.querySelectorAll('.pplx-mode-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = item.dataset.url;
        // Try multiple approaches for iframe escape
        try { window.top.open(url, '_blank'); } catch(err) {
          try { window.parent.open(url, '_blank'); } catch(err2) {
            window.open(url, '_blank');
          }
        }
        dd.classList.remove('open');
        setTimeout(() => dd.remove(), 200);
      });
    });

    btn.style.position = 'relative';
    btn.appendChild(dd);
    requestAnimationFrame(() => dd.classList.add('open'));

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!dd.contains(e.target)) {
          dd.classList.remove('open');
          setTimeout(() => dd.remove(), 200);
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  function closePanel() {
    panelOpen = false;
    currentTask = null;
    navTask = null;
    detailPanel.classList.remove('active');
    detailOverlay.classList.remove('active');
    if (navLevel === 2) {
      navLevel = navWorkstream ? 1 : 0;
    }
    updateBreadcrumb();
    // If the answer panel is shifted, un-shift it
    const ansPanel = document.querySelector('.cmd-answer-panel');
    if (ansPanel) {
      ansPanel.classList.remove('answer-with-detail');
      ansPanel.querySelectorAll('.ai-list-item--active').forEach(el => el.classList.remove('ai-list-item--active'));
    }
  }

  // ---- Navigation functions ----
  function navigateToCountry() {
    // Full reset: close panel, clear all filters, go to level 0
    closePanel();
    activeFilters.clear();
    document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
    // Clear assignee search UI
    const aInput = document.getElementById('assigneeSearchInput');
    const aTags = document.getElementById('assigneeActiveTags');
    const aResults = document.getElementById('assigneeResults');
    if (aInput) aInput.value = '';
    if (aTags) aTags.innerHTML = '';
    if (aResults) aResults.classList.remove('open');
    applyFilters();
    navLevel = 0;
    navWorkstream = null;
    navTask = null;
    updateBreadcrumb();
  }

  function navigateToWorkstream(wsId) {
    closePanel();
    // Clear existing filters and set the workstream filter
    activeFilters.clear();
    document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));

    activeFilters.set('workstream', new Set([wsId]));
    const chip = document.querySelector(`.filter-chip[data-filter="workstream"][data-value="${wsId}"]`);
    if (chip) chip.classList.add('active');

    applyFilters();
    navLevel = 1;
    navWorkstream = wsId;
    navTask = null;
    updateBreadcrumb();
  }

  function navigateBack() {
    if (navLevel === 2) {
      // Task → Workstream
      closePanel();
      if (navWorkstream) {
        navigateToWorkstream(navWorkstream);
      } else {
        navigateToCountry();
      }
    } else if (navLevel === 1) {
      // Workstream → Country
      navigateToCountry();
    }
    // Level 0 — nothing to go back to
  }

  function updateBreadcrumb() {
    let html = '<span class="breadcrumb-item breadcrumb-root' + (navLevel === 0 ? ' active' : '') + '" data-nav="country">🇩🇰 Denmark</span>';

    if (navLevel >= 1 && navWorkstream) {
      const ws = WORKSTREAMS.find(w => w.id === navWorkstream);
      if (ws) {
        html += '<span class="breadcrumb-sep">›</span>';
        html += `<span class="breadcrumb-item${navLevel === 1 ? ' active' : ''}" data-nav="workstream" data-ws="${ws.id}">${ws.emoji} ${ws.title}</span>`;
      }
    }

    if (navLevel === 2 && navTask) {
      const data = TASK_DATA[navTask];
      if (data) {
        html += '<span class="breadcrumb-sep">›</span>';
        html += `<span class="breadcrumb-item active">${data.title}</span>`;
      }
    }

    breadcrumbEl.innerHTML = html;

    // Show/hide back button
    backBtn.classList.toggle('visible', navLevel > 0);

    // Breadcrumb click handlers
    breadcrumbEl.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const nav = item.dataset.nav;
        if (nav === 'country') navigateToCountry();
        else if (nav === 'workstream') navigateToWorkstream(item.dataset.ws);
      });
    });
  }

  // ---- Completion Ring ----
  function updateCompletion() {
    let total = 0;
    let completed = 0;
    WORKSTREAMS.forEach(ws => {
      ws.tasks.forEach(t => {
        total++;
        if (t.status === 'blue') completed++;
      });
    });
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const circumference = 213.6;
    const offset = circumference - (pct / 100) * circumference;
    completionFill.style.strokeDashoffset = offset;
    completionText.textContent = pct + '%';

    if (pct < 30) {
      completionFill.style.stroke = 'var(--color-amber)';
      completionFill.style.filter = 'drop-shadow(0 0 6px var(--color-amber-glow))';
    } else if (pct < 70) {
      completionFill.style.stroke = 'var(--color-accent)';
      completionFill.style.filter = 'drop-shadow(0 0 6px var(--color-accent-glow))';
    } else {
      completionFill.style.stroke = 'var(--color-green)';
      completionFill.style.filter = 'drop-shadow(0 0 6px var(--color-green-glow))';
    }
  }

  // ---- Filtering ----
  const taskMeta = {};
  WORKSTREAMS.forEach(ws => {
    ws.tasks.forEach(t => {
      const data = TASK_DATA[t.id] || {};
      const dueDate = data.dueDate ? new Date(data.dueDate + ' UTC') : null;
      const isOverdue = dueDate && dueDate < new Date() && t.status !== 'blue';
      taskMeta[t.id] = {
        status: t.status,
        workstream: ws.id,
        assignee: t.assignee,
        overdue: isOverdue,
        needsAction: t.status === 'red' || t.status === 'amber',
        hasDeps: t.status === 'red'
      };
    });
  });

  function matchesFilters(taskId) {
    if (activeFilters.size === 0) return null;
    const meta = taskMeta[taskId];
    if (!meta) return false;

    for (const [filterType, values] of activeFilters) {
      let match = false;
      for (const val of values) {
        if (filterType === 'status' && meta.status === val) match = true;
        if (filterType === 'workstream' && meta.workstream === val) match = true;
        if (filterType === 'assignee' && meta.assignee === val) match = true;
        if (filterType === 'focus') {
          if (val === 'needs-action' && meta.needsAction) match = true;
          if (val === 'overdue' && meta.overdue) match = true;
          if (val === 'has-dependencies' && meta.hasDeps) match = true;
        }
      }
      if (!match) return false;
    }
    return true;
  }

  const originalPositions = new Map();

  function storeOriginalPositions() {
    taskEls.forEach(tn => {
      originalPositions.set(tn.el, {
        left: tn.el.style.left,
        top: tn.el.style.top
      });
    });
    wsEls.forEach(el => {
      originalPositions.set(el, {
        left: el.style.left,
        top: el.style.top
      });
    });
  }

  function applyFilters() {
    const hasFilters = activeFilters.size > 0;
    clearFiltersBtn.classList.toggle('visible', hasFilters);

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    if (originalPositions.size === 0) storeOriginalPositions();

    const matchingTasks = [];
    const matchingWsIds = new Set();

    taskEls.forEach(tn => {
      const taskId = tn.el.getAttribute('data-task');
      const result = matchesFilters(taskId);
      if (result === true) {
        matchingTasks.push(tn);
        matchingWsIds.add(WORKSTREAMS[tn.wsIndex].id);
      }
    });

    if (!hasFilters) {
      container.classList.remove('filtered');

      taskEls.forEach(tn => {
        tn.el.classList.remove('dimmed', 'highlighted');
        const orig = originalPositions.get(tn.el);
        if (orig) {
          tn.el.style.left = orig.left;
          tn.el.style.top = orig.top;
        }
      });

      wsEls.forEach(el => {
        el.classList.remove('dimmed', 'highlighted');
        const orig = originalPositions.get(el);
        if (orig) {
          el.style.left = orig.left;
          el.style.top = orig.top;
        }
      });

      centralEl.classList.remove('dimmed', 'highlighted');
      updateMiniMap();
      return;
    }

    container.classList.add('filtered');

    const allMatching = [];
    const groupArr = Array.from(new Map(matchingTasks.map(tn => [WORKSTREAMS[tn.wsIndex].id, { wsIndex: tn.wsIndex, tasks: [] }])).values());
    // Rebuild properly
    const groups = new Map();
    matchingTasks.forEach(tn => {
      const wsId = WORKSTREAMS[tn.wsIndex].id;
      if (!groups.has(wsId)) groups.set(wsId, { wsIndex: tn.wsIndex, tasks: [] });
      groups.get(wsId).tasks.push(tn);
    });
    groups.forEach(group => group.tasks.forEach(tn => allMatching.push(tn)));

    const taskRowH = 52;
    const totalHeight = allMatching.length * taskRowH;
    const taskStartY = centerY - totalHeight / 2 + 10;

    allMatching.forEach((tn, i) => {
      tn.el.classList.remove('dimmed');
      tn.el.classList.add('highlighted');
      tn.el.style.left = centerX + 'px';
      tn.el.style.top = (taskStartY + i * taskRowH) + 'px';
    });

    taskEls.forEach(tn => {
      const taskId = tn.el.getAttribute('data-task');
      const result = matchesFilters(taskId);
      if (!result) {
        tn.el.classList.remove('highlighted');
        tn.el.classList.add('dimmed');
      }
    });

    wsEls.forEach((el) => {
      el.classList.remove('highlighted');
      el.classList.add('dimmed');
    });

    centralEl.classList.add('dimmed');
    updateMiniMap();
  }

  // ---- Filter chip click handling ----
  document.querySelectorAll('.filter-chip:not(.filter-chip--clear):not([data-filter="assignee"])').forEach(chip => {
    chip.addEventListener('click', () => {
      const filterType = chip.dataset.filter;
      const value = chip.dataset.value;

      if (!activeFilters.has(filterType)) {
        activeFilters.set(filterType, new Set());
      }
      const values = activeFilters.get(filterType);

      if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        values.delete(value);
        if (values.size === 0) activeFilters.delete(filterType);
      } else {
        chip.classList.add('active');
        values.add(value);
      }

      // Update nav level based on filter state
      if (activeFilters.size > 0) {
        navLevel = 1;
        // If single workstream filter, track it
        const wsFilter = activeFilters.get('workstream');
        if (wsFilter && wsFilter.size === 1) {
          navWorkstream = Array.from(wsFilter)[0];
        } else {
          navWorkstream = null;
        }
      } else {
        navLevel = 0;
        navWorkstream = null;
      }
      updateBreadcrumb();
      applyFilters();
    });
  });

  clearFiltersBtn.addEventListener('click', () => {
    navigateToCountry();
  });

  // ---- Events: Click handling ----
  // Track if the mousedown was a drag vs a click
  let clickStartX = 0, clickStartY = 0;
  viewport.addEventListener('mousedown', (e) => {
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  }, true);

  container.addEventListener('click', (e) => {
    // If user dragged more than 5px, it's a pan not a click
    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
    if (dist > 5) return;

    // Skip if we just finished dragging a node
    if (nodeDragOccurred) return;

    // Task node click → open detail panel
    const taskNode = e.target.closest('.node--task');
    if (taskNode) {
      const taskId = taskNode.getAttribute('data-task');
      const wsId = taskNode.getAttribute('data-workstream');
      if (panelOpen && currentTask === taskId) {
        closePanel();
      } else {
        if (wsId) navWorkstream = wsId;
        openPanel(taskId);
      }
      return;
    }

    // Workstream node click → if collapsed, expand it; otherwise navigate
    const wsNode = e.target.closest('.node--workstream');
    if (wsNode) {
      const wsId = wsNode.getAttribute('data-workstream');
      if (!wsId) return;
      // If collapsed, expand instead of navigating
      if (wsNode.classList.contains('collapsed')) {
        const wsIdx = wsEls.indexOf(wsNode);
        if (wsIdx >= 0) toggleCollapseWorkstream(wsIdx);
        return;
      }
      navigateToWorkstream(wsId);
      return;
    }

    // Central node click → go to country (reset)
    const centralNode = e.target.closest('.node--central');
    if (centralNode) {
      navigateToCountry();
      return;
    }

    // Click on empty space → go all the way back to country view
    if (navLevel > 0) {
      navigateToCountry();
    }
  });

  // Back button
  backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateBack();
  });

  // Detail panel close
  detailClose.addEventListener('click', closePanel);
  detailOverlay.addEventListener('click', closePanel);

  // ---- Keyboard Navigation ----
  let focusedNodeIndex = -1;
  const allNodes = [];

  function buildNodeList() {
    allNodes.length = 0;
    allNodes.push(centralEl);
    wsEls.forEach(el => allNodes.push(el));
    taskEls.forEach(tn => allNodes.push(tn.el));
  }

  document.addEventListener('keydown', (e) => {
    // Escape → close assignee dropdown first, then panel, then go back
    if (e.key === 'Escape') {
      const aResults = document.getElementById('assigneeResults');
      if (aResults && aResults.classList.contains('open')) {
        aResults.classList.remove('open');
        return;
      }
      if (panelOpen) {
        closePanel();
      } else {
        navigateBack();
      }
      return;
    }

    // Backspace → go back one level
    if (e.key === 'Backspace' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      navigateBack();
      return;
    }

    // Arrow keys → navigate between visible nodes
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      buildNodeList();
      // Get visible nodes only
      const visible = allNodes.filter(n => !n.classList.contains('dimmed') && n.offsetParent !== null);
      if (visible.length === 0) return;

      // Remove focus from current
      if (focusedNodeIndex >= 0 && focusedNodeIndex < visible.length) {
        visible[focusedNodeIndex].classList.remove('keyboard-focus');
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        focusedNodeIndex = (focusedNodeIndex + 1) % visible.length;
      } else {
        focusedNodeIndex = (focusedNodeIndex - 1 + visible.length) % visible.length;
      }

      visible[focusedNodeIndex].classList.add('keyboard-focus');
      visible[focusedNodeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Enter → activate focused node
    if (e.key === 'Enter' && focusedNodeIndex >= 0) {
      buildNodeList();
      const visible = allNodes.filter(n => !n.classList.contains('dimmed') && n.offsetParent !== null);
      if (visible[focusedNodeIndex]) {
        visible[focusedNodeIndex].click();
      }
    }
  });

  // ---- Hover tooltips (QoL A) ----
  let tooltipTimeout;

  function showTooltip(e, content) {
    clearTimeout(tooltipTimeout);
    tooltip.innerHTML = content;
    tooltip.classList.add('visible');
    positionTooltip(e);
  }

  function positionTooltip(e) {
    const x = e.clientX + 14;
    const y = e.clientY - 8;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';

    // Keep in viewport
    const rect = tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      tooltip.style.left = (e.clientX - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight - 10) {
      tooltip.style.top = (e.clientY - rect.height - 10) + 'px';
    }
  }

  function hideTooltip() {
    tooltipTimeout = setTimeout(() => {
      tooltip.classList.remove('visible');
    }, 100);
  }

  // Workstream hover
  wsEls.forEach((el, i) => {
    const ws = WORKSTREAMS[i];
    const counts = { green: 0, amber: 0, red: 0, blue: 0 };
    ws.tasks.forEach(t => counts[t.status]++);

    el.addEventListener('mouseenter', (e) => {
      showTooltip(e, `
        <div class="tt-title">${ws.emoji} ${ws.title}</div>
        <div class="tt-stats">
          ${counts.green > 0 ? `<span class="tt-stat"><span class="tt-dot tt-dot--green"></span>${counts.green} On Track</span>` : ''}
          ${counts.amber > 0 ? `<span class="tt-stat"><span class="tt-dot tt-dot--amber"></span>${counts.amber} Attention</span>` : ''}
          ${counts.red > 0 ? `<span class="tt-stat"><span class="tt-dot tt-dot--red"></span>${counts.red} Blocked</span>` : ''}
          ${counts.blue > 0 ? `<span class="tt-stat"><span class="tt-dot tt-dot--blue"></span>${counts.blue} Done</span>` : ''}
        </div>
        <div class="tt-hint">Click to filter</div>
      `);
    });
    el.addEventListener('mousemove', positionTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  });

  // Task hover
  taskEls.forEach(tn => {
    const taskId = tn.el.getAttribute('data-task');
    const data = TASK_DATA[taskId];
    if (!data) return;

    const statusLabels = { green: 'On Track', amber: 'Attention', red: 'Blocked', blue: 'Completed' };

    tn.el.addEventListener('mouseenter', (e) => {
      showTooltip(e, `
        <div class="tt-title">${data.emoji} ${data.title}</div>
        <div class="tt-meta">${data.assignee} · Due ${data.dueDate}</div>
        <div class="tt-status"><span class="tt-dot tt-dot--${data.statusColor}"></span>${statusLabels[data.statusColor] || data.status}</div>
        <div class="tt-hint">Click for details</div>
      `);

      // QoL E: Highlight connected lines
      highlightConnections(tn, true);
    });
    tn.el.addEventListener('mousemove', positionTooltip);
    tn.el.addEventListener('mouseleave', (e) => {
      hideTooltip();
      highlightConnections(tn, false);
    });
  });

  // ---- QoL E: Animated connection highlight ----
  function highlightConnections(tn, on) {
    const ws = WORKSTREAMS[tn.wsIndex];
    const taskId = ws.tasks[tn.taskIndex].id;
    // Find lines connected to this task
    const taskLine = svg.querySelector(`[data-line-id="line-ws-${ws.id}-task-${taskId}"]`);
    const wsLine = svg.querySelector(`[data-line-id="line-c-ws-${ws.id}"]`);

    if (taskLine) taskLine.classList.toggle('connection-line--active', on);
    if (wsLine) wsLine.classList.toggle('connection-line--active', on);
  }

  // ---- QoL C: Focus mode on hover (highlight lineage) ----
  let focusModeTimeout;

  container.addEventListener('mouseover', (e) => {
    const taskNode = e.target.closest('.node--task');
    if (taskNode && navLevel === 0) {
      clearTimeout(focusModeTimeout);
      focusModeTimeout = setTimeout(() => {
        container.classList.add('focus-mode');
        // Find workstream
        const wsId = taskNode.getAttribute('data-workstream');
        // Highlight lineage: central, workstream, this task
        centralEl.classList.add('focus-lineage');
        wsEls.forEach(el => {
          if (el.getAttribute('data-workstream') === wsId) {
            el.classList.add('focus-lineage');
          }
        });
        taskNode.classList.add('focus-lineage');
      }, 600); // Only activate after 600ms hover
    }
  });

  container.addEventListener('mouseout', (e) => {
    const taskNode = e.target.closest('.node--task');
    if (taskNode || !e.relatedTarget || !e.relatedTarget.closest('.node--task')) {
      clearTimeout(focusModeTimeout);
      container.classList.remove('focus-mode');
      document.querySelectorAll('.focus-lineage').forEach(el => el.classList.remove('focus-lineage'));
    }
  });

  // ---- QoL F: Mini-map ----
  function updateMiniMap() {
    const canvas = document.getElementById('miniMapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = container.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(19, 18, 16, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    ctx.strokeStyle = 'rgba(79, 152, 163, 0.2)';
    ctx.lineWidth = 0.5;
    const cxM = parseFloat(centralEl.style.left) * scaleX;
    const cyM = parseFloat(centralEl.style.top) * scaleY;

    wsEls.forEach(el => {
      const wx = parseFloat(el.style.left) * scaleX;
      const wy = parseFloat(el.style.top) * scaleY;
      ctx.beginPath();
      ctx.moveTo(cxM, cyM);
      ctx.lineTo(wx, wy);
      ctx.stroke();
    });

    // Draw central
    ctx.fillStyle = 'rgba(79, 152, 163, 0.8)';
    ctx.beginPath();
    ctx.arc(cxM, cyM, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw workstreams
    wsEls.forEach(el => {
      const dimmed = el.classList.contains('dimmed');
      ctx.fillStyle = dimmed ? 'rgba(79, 152, 163, 0.15)' : 'rgba(79, 152, 163, 0.6)';
      ctx.beginPath();
      ctx.arc(parseFloat(el.style.left) * scaleX, parseFloat(el.style.top) * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw tasks
    const statusColors = {
      green: 'rgba(74, 222, 128, 0.7)',
      amber: 'rgba(251, 191, 36, 0.7)',
      red: 'rgba(248, 113, 113, 0.7)',
      blue: 'rgba(96, 165, 250, 0.7)'
    };

    taskEls.forEach(tn => {
      const dimmed = tn.el.classList.contains('dimmed');
      const status = tn.el.getAttribute('data-status');
      ctx.fillStyle = dimmed ? 'rgba(90, 89, 87, 0.2)' : (statusColors[status] || 'rgba(224, 223, 221, 0.5)');
      ctx.beginPath();
      ctx.arc(parseFloat(tn.el.style.left) * scaleX, parseFloat(tn.el.style.top) * scaleY, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---- Assignee search filter ----
  const allAssignees = new Set();
  WORKSTREAMS.forEach(ws => ws.tasks.forEach(t => allAssignees.add(t.assignee)));
  window.ALL_ASSIGNEES = Array.from(allAssignees);

  const ASSIGNEE_COLORS = [
    '#4f98a3', '#e06c75', '#d19a66', '#98c379', '#c678dd',
    '#61afef', '#56b6c2', '#e5c07b', '#be5046', '#7ec699'
  ];
  function assigneeColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length];
  }
  function assigneeInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase();
  }

  const assigneeInput = document.getElementById('assigneeSearchInput');
  const assigneeResults = document.getElementById('assigneeResults');
  const assigneeTags = document.getElementById('assigneeActiveTags');
  const assigneeList = Array.from(allAssignees).sort();

  function positionAssigneeDropdown() {
    const rect = assigneeInput.getBoundingClientRect();
    assigneeResults.style.top = (rect.bottom + 4) + 'px';
    assigneeResults.style.left = rect.left + 'px';
  }

  function renderAssigneeResults(query) {
    assigneeResults.innerHTML = '';
    const q = query.toLowerCase().trim();
    const filtered = q ? assigneeList.filter(n => n.toLowerCase().includes(q)) : assigneeList;
    if (filtered.length === 0) {
      assigneeResults.innerHTML = '<div class="assignee-result-empty">No matches</div>';
      positionAssigneeDropdown();
      assigneeResults.classList.add('open');
      return;
    }
    const selectedSet = activeFilters.get('assignee') || new Set();
    filtered.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'assignee-result-item' + (selectedSet.has(name) ? ' active' : '');
      const color = assigneeColor(name);
      btn.innerHTML = `<span class="result-avatar" style="background:${color}">${assigneeInitials(name)}</span><span class="result-name">${name}</span><span class="result-check">✓</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAssigneeFilter(name);
        assigneeInput.value = '';
        renderAssigneeResults('');
        renderAssigneeTags();
      });
      assigneeResults.appendChild(btn);
    });
    positionAssigneeDropdown();
    assigneeResults.classList.add('open');
  }

  function renderAssigneeTags() {
    assigneeTags.innerHTML = '';
    const selectedSet = activeFilters.get('assignee');
    if (!selectedSet || selectedSet.size === 0) return;
    selectedSet.forEach(name => {
      const tag = document.createElement('span');
      tag.className = 'assignee-tag';
      const color = assigneeColor(name);
      tag.innerHTML = `<span class="tag-avatar" style="background:${color}">${assigneeInitials(name)}</span>${name.split(' ')[0]}<span class="tag-remove">✕</span>`;
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAssigneeFilter(name);
        renderAssigneeResults(assigneeInput.value);
        renderAssigneeTags();
      });
      assigneeTags.appendChild(tag);
    });
  }

  function toggleAssigneeFilter(name) {
    if (!activeFilters.has('assignee')) {
      activeFilters.set('assignee', new Set());
    }
    const values = activeFilters.get('assignee');
    if (values.has(name)) {
      values.delete(name);
      if (values.size === 0) activeFilters.delete('assignee');
    } else {
      values.add(name);
    }
    if (activeFilters.size > 0) { navLevel = 1; } else { navLevel = 0; navWorkstream = null; }
    updateBreadcrumb();
    applyFilters();
  }

  // Show dropdown on focus / input
  assigneeInput.addEventListener('focus', () => renderAssigneeResults(assigneeInput.value));
  assigneeInput.addEventListener('input', () => renderAssigneeResults(assigneeInput.value));

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-group--assignee')) {
      assigneeResults.classList.remove('open');
    }
  });

  // ---- Pan & Zoom ----
  let panX = 0, panY = 0;
  let zoom = 1;
  const MIN_ZOOM = 0.55;
  const MAX_ZOOM = 1.6;
  const PAN_LIMIT = 400; // px beyond map edges

  let isDragging = false;
  let dragStartX, dragStartY;
  let panStartX, panStartY;

  function applyTransform() {
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    container.style.transformOrigin = '50% 50%';
    updateMiniMap();
  }

  function clampPan() {
    const limit = PAN_LIMIT * zoom;
    panX = Math.max(-limit, Math.min(limit, panX));
    panY = Math.max(-limit, Math.min(limit, panY));
  }

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    // Don't zoom when over command bar or detail panel
    if (e.target.closest('.cmd-overlay') || e.target.closest('.detail-panel') || e.target.closest('.cmd-answer-panel')) return;
    e.preventDefault();

    const delta = -e.deltaY * 0.001;
    const prevZoom = zoom;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));

    // Zoom toward cursor
    const rect = viewport.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const factor = zoom / prevZoom;
    panX = cx - (cx - panX) * factor;
    panY = cy - (cy - panY) * factor;

    clampPan();
    applyTransform();
  }, { passive: false });

  // Mouse drag pan
  viewport.addEventListener('mousedown', (e) => {
    // Only pan on left click on empty space
    if (e.button !== 0) return;
    if (e.target.closest('.node') || e.target.closest('.detail-panel') || e.target.closest('.cmd-overlay') || e.target.closest('.cmd-answer-panel')) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    viewport.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panX = panStartX + dx;
    panY = panStartY + dy;
    clampPan();
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewport.style.cursor = '';
    }
  });

  // Touch pan/zoom support
  let lastTouchDist = 0;
  let lastTouchCenter = null;

  viewport.addEventListener('touchstart', (e) => {
    if (e.target.closest('.node') || e.target.closest('.detail-panel')) return;
    if (e.touches.length === 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      panStartX = panX;
      panStartY = panY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartX;
      const dy = e.touches[0].clientY - dragStartY;
      panX = panStartX + dx;
      panY = panStartY + dy;
      clampPan();
      applyTransform();
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / lastTouchDist;
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale));
      lastTouchDist = dist;
      clampPan();
      applyTransform();
    }
  }, { passive: true });

  viewport.addEventListener('touchend', () => {
    isDragging = false;
    lastTouchDist = 0;
    lastTouchCenter = null;
  });

  // Reset pan/zoom on double-click
  viewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('.node')) return;
    panX = 0;
    panY = 0;
    zoom = 1;
    applyTransform();
  });

  // Expose pan/zoom for command bar
  window.resetPanZoom = function() {
    panX = 0; panY = 0; zoom = 1;
    applyTransform();
  };

  // ---- Commands button (visible trigger for slash commands) ----
  const cmdGroup = document.createElement('div');
  cmdGroup.className = 'filter-group';
  cmdGroup.style.marginLeft = 'auto';
  const cmdLabel = document.createElement('span');
  cmdLabel.className = 'filter-label';
  cmdLabel.textContent = 'Commands';
  const cmdBtn = document.createElement('button');
  cmdBtn.className = 'commands-trigger';
  cmdBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 6h8M4 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>Open</span>
    <kbd>/</kbd>
  `;
  cmdBtn.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('open-command-bar', { detail: { prefill: '/' } }));
  });
  cmdGroup.appendChild(cmdLabel);
  cmdGroup.appendChild(cmdBtn);
  const filterBar = document.getElementById('filterBar');
  if (filterBar) {
    // Add a divider before commands
    const div = document.createElement('div');
    div.className = 'filter-divider';
    filterBar.appendChild(div);
    filterBar.appendChild(cmdGroup);
  }

  // ---- Re-store positions on resize ----
  window.addEventListener('resize', () => {
    if (activeFilters.size === 0) {
      originalPositions.clear();
    }
  });

  let raf;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  });


  // ---- Draggable Nodes with Physics ----
  let nodeDragOccurred = false;
  let draggedNode = null;
  let dragNodeStartX = 0, dragNodeStartY = 0;
  let dragMouseStartX = 0, dragMouseStartY = 0;
  let draggedIsWs = false;
  let draggedWsIndex = -1;

  function getNodeCenter(el) {
    return { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
  }

  function setNodePos(el, x, y) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  // Mouse down on a node starts drag
  function onNodeDragStart(e, nodeEl, isWs, wsIdx) {
    if (e.target.closest('.node-collapse-btn') || e.target.closest('.node-ws-reset-btn')) return; // don't drag on buttons
    e.stopPropagation();
    e.preventDefault();
    draggedNode = nodeEl;
    draggedIsWs = isWs;
    draggedWsIndex = wsIdx;
    const pos = getNodeCenter(nodeEl);
    dragNodeStartX = pos.x;
    dragNodeStartY = pos.y;
    dragMouseStartX = e.clientX;
    dragMouseStartY = e.clientY;
    nodeEl.classList.add('dragging');
  }

  // Get the bounding box of a node in map coordinates (center-based, accounting for translate(-50%,-50%))
  function getNodeBBox(nodeEl) {
    const inner = nodeEl.querySelector('.node-inner');
    if (!inner) return null;
    const r = inner.getBoundingClientRect();
    const w = r.width / zoom;
    const h = r.height / zoom;
    const cx = parseFloat(nodeEl.style.left);
    const cy = parseFloat(nodeEl.style.top);
    return { cx, cy, hw: w / 2, hh: h / 2 };
  }

  // Constrain a proposed position so the dragged node doesn't overlap any other visible node
  function constrainPosition(nodeEl, proposedX, proposedY) {
    const inner = nodeEl.querySelector('.node-inner');
    if (!inner) return { x: proposedX, y: proposedY };
    const r = inner.getBoundingClientRect();
    const mw = (r.width / zoom) / 2;
    const mh = (r.height / zoom) / 2;
    let x = proposedX, y = proposedY;
    const gap = 4; // minimum gap between edges

    // Collect all nodes to check against
    const allNodeEls = [centralEl, ...wsEls, ...taskEls.map(t => t.el)];
    // Get the set of nodes being dragged (the node + its children if WS)
    const dragFamily = new Set([nodeEl]);
    if (draggedIsWs && draggedWsIndex >= 0) {
      taskEls.forEach(tn => {
        if (tn.wsIndex === draggedWsIndex) dragFamily.add(tn.el);
      });
    }

    for (const otherEl of allNodeEls) {
      if (dragFamily.has(otherEl)) continue;
      if (otherEl.classList.contains('collapsed-hidden')) continue;
      const ob = getNodeBBox(otherEl);
      if (!ob) continue;

      // Check AABB overlap between proposed position and other
      const overlapX = (mw + ob.hw + gap) - Math.abs(x - ob.cx);
      const overlapY = (mh + ob.hh + gap) - Math.abs(y - ob.cy);

      if (overlapX > 0 && overlapY > 0) {
        // Push back along the axis with the smallest overlap (least disruptive)
        if (overlapX < overlapY) {
          x += (x >= ob.cx ? overlapX : -overlapX);
        } else {
          y += (y >= ob.cy ? overlapY : -overlapY);
        }
      }
    }
    return { x, y };
  }

  document.addEventListener('mousemove', (e) => {
    if (!draggedNode) return;
    const dx = (e.clientX - dragMouseStartX) / zoom;
    const dy = (e.clientY - dragMouseStartY) / zoom;
    let newX = dragNodeStartX + dx;
    let newY = dragNodeStartY + dy;

    // Hard barrier: constrain so the dragged node can't overlap others
    const constrained = constrainPosition(draggedNode, newX, newY);
    newX = constrained.x;
    newY = constrained.y;
    setNodePos(draggedNode, newX, newY);

    // If dragging a workstream, move children too
    if (draggedIsWs && draggedWsIndex >= 0) {
      const ws = WORKSTREAMS[draggedWsIndex];
      taskEls.forEach(tn => {
        if (tn.wsIndex === draggedWsIndex) {
          const orig = originalPositions.get(tn.el);
          const wsOrig = originalPositions.get(draggedNode);
          if (orig && wsOrig) {
            const offsetX = parseFloat(orig.left) - parseFloat(wsOrig.left);
            const offsetY = parseFloat(orig.top) - parseFloat(wsOrig.top);
            tn.el.classList.add('child-following');
            setNodePos(tn.el, newX + offsetX, newY + offsetY);
          }
        }
      });
    }

    // Update SVG lines while dragging
    redrawLines();
  });

  document.addEventListener('mouseup', (e) => {
    if (!draggedNode) return;
    const totalDist = Math.hypot(e.clientX - dragMouseStartX, e.clientY - dragMouseStartY);
    draggedNode.classList.remove('dragging');

    // Update stored positions
    originalPositions.set(draggedNode, {
      left: draggedNode.style.left,
      top: draggedNode.style.top
    });

    // If was WS, update children stored positions too
    if (draggedIsWs && draggedWsIndex >= 0) {
      taskEls.forEach(tn => {
        if (tn.wsIndex === draggedWsIndex) {
          tn.el.classList.remove('child-following');
          originalPositions.set(tn.el, {
            left: tn.el.style.left,
            top: tn.el.style.top
          });
        }
      });
    }

    // Hard barrier is enforced during drag, no post-drag resolution needed

    // If we actually dragged (not just clicked), suppress the click
    if (totalDist > 5) {
      nodeDragOccurred = true;
      setTimeout(() => { nodeDragOccurred = false; }, 50);
    }

    draggedNode = null;
    draggedWsIndex = -1;
    redrawLines();
  });

  // Attach drag handlers
  wsEls.forEach((el, i) => {
    el.addEventListener('mousedown', (e) => {
      // Only start drag if clicking the node (not buttons inside)
      if (e.button !== 0) return;
      onNodeDragStart(e, el, true, i);
    });
  });

  taskEls.forEach(tn => {
    tn.el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onNodeDragStart(e, tn.el, false, -1);
    });
  });

  // Make central Denmark node draggable
  centralEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onNodeDragStart(e, centralEl, false, -1);
  });



  // Redraw SVG lines based on current node positions
  function redrawLines() {
    // Use offsetWidth/Height — these are the un-transformed container dimensions
    // (getBoundingClientRect returns scaled values after pan/zoom transform)
    const cw = container.offsetWidth || container.scrollWidth;
    const ch = container.offsetHeight || container.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
    svg.innerHTML = '';
    const cx = parseFloat(centralEl.style.left);
    const cy = parseFloat(centralEl.style.top);

    wsEls.forEach((el, i) => {
      const ws = WORKSTREAMS[i];
      const wx = parseFloat(el.style.left);
      const wy = parseFloat(el.style.top);
      addLine(svg, cx, cy, wx, wy, 'connection-line--primary', 'line-c-ws-' + ws.id);

      // Task lines
      ws.tasks.forEach((task, ti) => {
        const taskTn = taskEls.find(t => t.wsIndex === i && t.taskIndex === ti);
        if (taskTn && !taskTn.el.classList.contains('collapsed-hidden')) {
          const tx = parseFloat(taskTn.el.style.left);
          const ty = parseFloat(taskTn.el.style.top);
          addLine(svg, wx, wy, tx, ty, 'connection-line--secondary', 'line-ws-' + ws.id + '-task-' + task.id);
        }
      });
    });
  }

  // ---- Cross-Link Data (shown inside expanded task detail, NOT as lines) ----
  const CROSS_LINKS = [
    { from: 'neg-3', to: 'leg-1', label: 'GDPR compliance' },
    { from: 'tech-1', to: 'com-2', label: 'API blocks comms' },
    { from: 'tech-1', to: 'neg-2', label: 'Uptime feasibility' },
    { from: 'tech-1', to: 'com-1', label: 'SteerCo risk item' },
    { from: 'tech-2', to: 'doc-3', label: 'Encoding issues' },
    { from: 'neg-2', to: 'leg-2', label: 'SLA terms' },
  ];

  // Get related tasks for a given task ID
  function getRelatedTasks(taskId) {
    const related = [];
    CROSS_LINKS.forEach(link => {
      if (link.from === taskId) related.push({ taskId: link.to, label: link.label });
      if (link.to === taskId) related.push({ taskId: link.from, label: link.label });
    });
    return related;
  }

  // ---- Cross-Link Color System ----
  // Each cross-link gets its own unique color for the relationship dots
  const CROSS_LINK_COLORS = [
    '#e5c07b', // gold
    '#98c379', // green
    '#ff6b9d', // pink
    '#7ec699', // sage
    '#e06c75', // warm red
    '#56b6c2', // cyan
  ];

  // Build a map: taskId → [{color, linkedTaskId, linkedWsId, label}]
  const taskCrossLinks = {};
  CROSS_LINKS.forEach((link, idx) => {
    const color = CROSS_LINK_COLORS[idx % CROSS_LINK_COLORS.length];
    let fromWs = null, toWs = null;
    WORKSTREAMS.forEach(ws => {
      ws.tasks.forEach(t => {
        if (t.id === link.from) fromWs = ws.id;
        if (t.id === link.to) toWs = ws.id;
      });
    });
    if (!taskCrossLinks[link.from]) taskCrossLinks[link.from] = [];
    if (!taskCrossLinks[link.to]) taskCrossLinks[link.to] = [];
    taskCrossLinks[link.from].push({ color, linkedTaskId: link.to, linkedWsId: toWs, label: link.label });
    taskCrossLinks[link.to].push({ color, linkedTaskId: link.from, linkedWsId: fromWs, label: link.label });
  });

  // Helper: find the primary WS for a task
  function getPrimaryWs(taskId) {
    for (const ws of WORKSTREAMS) {
      for (const t of ws.tasks) { if (t.id === taskId) return ws.id; }
    }
    return null;
  }

  // Helper: get all WS ids a task belongs to (primary + secondary)
  function getTaskWsIds(taskId) {
    const ids = [];
    const primary = getPrimaryWs(taskId);
    if (primary) ids.push(primary);
    if (MULTI_TITLE[taskId]) {
      MULTI_TITLE[taskId].forEach(wsId => { if (!ids.includes(wsId)) ids.push(wsId); });
    }
    return ids;
  }

  // Helper: get all relationships for a task (both cross-links and multi-title)
  function getAllRelationships(taskId) {
    const rels = { titleLinks: [], taskLinks: [] };
    // Multi-title: secondary WS memberships
    if (MULTI_TITLE[taskId]) {
      MULTI_TITLE[taskId].forEach(wsId => {
        const ws = WORKSTREAMS.find(w => w.id === wsId);
        if (ws) rels.titleLinks.push({ wsId, wsTitle: ws.title, wsEmoji: ws.emoji, color: WS_COLORS[wsId] });
      });
    }
    // Cross-links: task-to-task relationships
    if (taskCrossLinks[taskId]) {
      taskCrossLinks[taskId].forEach(lnk => {
        const linkedData = TASK_DATA[lnk.linkedTaskId];
        if (linkedData) {
          rels.taskLinks.push({
            taskId: lnk.linkedTaskId,
            color: lnk.color,
            label: lnk.label,
            title: linkedData.title,
            emoji: linkedData.emoji,
            wsId: lnk.linkedWsId
          });
        }
      });
    }
    return rels;
  }

  // Add dots to task nodes: LEFT = title membership, RIGHT = task relationships
  taskEls.forEach(tn => {
    const taskId = tn.el.getAttribute('data-task');

    // LEFT corner: multi-title dots (colored to match the secondary WS outline)
    if (MULTI_TITLE[taskId]) {
      const leftDots = document.createElement('div');
      leftDots.className = 'title-link-dots';
      MULTI_TITLE[taskId].forEach(wsId => {
        const ws = WORKSTREAMS.find(w => w.id === wsId);
        if (!ws) return;
        const dot = document.createElement('span');
        dot.className = 'title-link-dot';
        dot.style.backgroundColor = WS_COLORS[wsId];
        dot.title = 'Also in: ' + ws.emoji + ' ' + ws.title;
        dot.setAttribute('data-ws-id', wsId);

        // Hover: highlight all tasks belonging to this workstream
        dot.addEventListener('mouseenter', function() {
          var hoverWsId = wsId;
          var tasksInWs = new Set();
          // Find all tasks in this workstream (primary + multi-title)
          var wsObj = WORKSTREAMS.find(function(w) { return w.id === hoverWsId; });
          if (wsObj) wsObj.tasks.forEach(function(t) { tasksInWs.add(t.id); });
          // Also find tasks with multi-title membership in this WS
          Object.keys(MULTI_TITLE).forEach(function(tid) {
            if (MULTI_TITLE[tid].includes(hoverWsId)) tasksInWs.add(tid);
          });

          viewport.classList.add('rel-hover-dimmed');
          document.querySelectorAll('.node--task').forEach(function(el) {
            var tid = el.getAttribute('data-task');
            if (tasksInWs.has(tid)) {
              el.classList.add('ws-dot-highlight');
              el.classList.add('rel-hover-highlight');
            } else {
              el.classList.add('rel-hover-faded');
            }
          });
          // Highlight the workstream category node itself
          document.querySelectorAll('.node--workstream, .node--ws').forEach(function(el) {
            var elWs = el.getAttribute('data-workstream') || el.getAttribute('data-ws');
            if (elWs === hoverWsId) {
              el.classList.add('ws-dot-highlight-ws');
              el.classList.add('rel-hover-highlight');
            } else {
              el.classList.add('rel-hover-faded');
            }
          });
        });
        dot.addEventListener('mouseleave', function() {
          viewport.classList.remove('rel-hover-dimmed');
          document.querySelectorAll('.ws-dot-highlight, .ws-dot-highlight-ws, .rel-hover-highlight, .rel-hover-faded').forEach(function(el) {
            el.classList.remove('ws-dot-highlight', 'ws-dot-highlight-ws', 'rel-hover-highlight', 'rel-hover-faded');
          });
        });

        leftDots.appendChild(dot);
      });
      tn.el.appendChild(leftDots);
    }

    // RIGHT corner: task relationship dots
    const links = taskCrossLinks[taskId];
    if (links && links.length > 0) {
      const rightDots = document.createElement('div');
      rightDots.className = 'cross-link-dots';
      links.forEach(lnk => {
        const dot = document.createElement('span');
        dot.className = 'cross-link-dot';
        dot.style.backgroundColor = lnk.color;
        const linkedData = TASK_DATA[lnk.linkedTaskId];
        dot.title = 'Task link — ' + (linkedData ? linkedData.title : lnk.linkedTaskId);
        // Click opens comparison view
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          openComparisonView(taskId, lnk.linkedTaskId);
        });
        // Hover: highlight this task + the linked task
        dot.addEventListener('mouseenter', function() {
          var linkedId = lnk.linkedTaskId;
          viewport.classList.add('rel-hover-dimmed');
          document.querySelectorAll('.node--task').forEach(function(el) {
            var tid = el.getAttribute('data-task');
            if (tid === taskId || tid === linkedId) {
              el.classList.add('rel-hover-highlight');
            } else {
              el.classList.add('rel-hover-faded');
            }
          });
          document.querySelectorAll('.node--workstream, .node--ws').forEach(function(el) {
            el.classList.add('rel-hover-faded');
          });
        });
        dot.addEventListener('mouseleave', function() {
          viewport.classList.remove('rel-hover-dimmed');
          document.querySelectorAll('.rel-hover-highlight, .rel-hover-faded').forEach(function(el) {
            el.classList.remove('rel-hover-highlight', 'rel-hover-faded');
          });
        });
        rightDots.appendChild(dot);
      });
      tn.el.appendChild(rightDots);
    }

    // BOTTOM RIGHT: show-all-related icon
    const allRels = getAllRelationships(taskId);
    if (allRels.titleLinks.length + allRels.taskLinks.length > 0) {
      const allBtn = document.createElement('button');
      allBtn.className = 'show-all-related-btn';
      allBtn.title = 'View all related tasks';
      allBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M8 3H3v5M16 21h5v-5M8 21H3v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
      allBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAllRelatedView(taskId);
      });

      // Hover: dim map + highlight related task bubbles
      allBtn.addEventListener('mouseenter', () => {
        const rels = getAllRelationships(taskId);
        const relatedIds = new Set();
        rels.taskLinks.forEach(function(lnk) { relatedIds.add(lnk.taskId); });
        rels.titleLinks.forEach(function(tl) {
          var ws = WORKSTREAMS.find(function(w) { return w.id === tl.wsId; });
          if (ws) ws.tasks.forEach(function(t) { if (t.id !== taskId) relatedIds.add(t.id); });
        });
        relatedIds.add(taskId);
        viewport.classList.add('rel-hover-dimmed');
        document.querySelectorAll('.node--task').forEach(function(el) {
          var tid = el.getAttribute('data-task');
          if (relatedIds.has(tid)) {
            el.classList.add('rel-hover-highlight');
          } else {
            el.classList.add('rel-hover-faded');
          }
        });
        document.querySelectorAll('.node--ws').forEach(function(el) {
          el.classList.add('rel-hover-faded');
        });
      });
      allBtn.addEventListener('mouseleave', () => {
        viewport.classList.remove('rel-hover-dimmed');
        document.querySelectorAll('.rel-hover-highlight, .rel-hover-faded').forEach(function(el) {
          el.classList.remove('rel-hover-highlight', 'rel-hover-faded');
        });
      });

      tn.el.appendChild(allBtn);
    }
  });

  // ---- Comparison View (2 tasks side by side) ----
  function buildTaskCard(taskId) {
    const data = TASK_DATA[taskId];
    if (!data) return '';
    const labels = { green: 'On Track', amber: 'Attention Needed', red: 'Blocked', blue: 'Completed' };
    const wsIds = getTaskWsIds(taskId);
    const wsTags = wsIds.map(wsId => {
      const ws = WORKSTREAMS.find(w => w.id === wsId);
      return ws ? `<span class="cv-ws-tag" style="border-color:${WS_COLORS[wsId]};color:${WS_COLORS[wsId]}">${ws.emoji} ${ws.title}</span>` : '';
    }).join('');
    return `
      <div class="cv-task-card" data-cv-task="${taskId}">
        <div class="cv-card-header">
          <span class="cv-card-emoji">${data.emoji}</span>
          <h3 class="cv-card-title">${data.title}</h3>
          <span class="cv-card-status">
            <span class="status-dot status-dot--${data.statusColor}"></span>
            ${labels[data.statusColor] || data.status}
          </span>
        </div>
        <div class="cv-card-ws-tags">${wsTags}</div>
        <div class="cv-card-meta">
          <span>${data.assignee}</span>
          <span>Due ${data.dueDate}</span>
        </div>
        <div class="cv-card-desc">${data.description}</div>
        <div class="cv-card-update">
          <strong>Latest:</strong> ${data.update}
          <span class="cv-card-update-date">${data.updateDate}</span>
        </div>
        ${data.todos && data.todos.length > 0 ? `
          <div class="cv-card-todos">
            <strong>To-Do (${data.todos.length})</strong>
            ${data.todos.map(todo => `<div class="cv-todo-item">• ${todo.text}</div>`).join('')}
          </div>
        ` : ''}
        <button class="cv-open-task-btn" data-open-task="${taskId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Open full task
        </button>
      </div>
    `;
  }

  function getRelDescription(taskIdA, taskIdB) {
    var match = null;
    if (taskCrossLinks[taskIdA]) {
      match = taskCrossLinks[taskIdA].find(function(l) { return l.linkedTaskId === taskIdB; });
    }
    if (!match) return '';
    var dA = TASK_DATA[taskIdA];
    var dB = TASK_DATA[taskIdB];
    var nameA = dA ? dA.title : taskIdA;
    var nameB = dB ? dB.title : taskIdB;
    return nameA + ' \u2194 ' + nameB + ' \u2014 ' + match.label;
  }

  function buildComparisonInner(taskIdA, taskIdB, allLinksA) {
    let relColor = '#4f98a3', relLabel = '';
    if (taskCrossLinks[taskIdA]) {
      const match = taskCrossLinks[taskIdA].find(l => l.linkedTaskId === taskIdB);
      if (match) { relColor = match.color; relLabel = match.label; }
    }
    var relDesc = getRelDescription(taskIdA, taskIdB);
    return '<div class="cv-cards">' +
      buildTaskCard(taskIdA) +
      '<div class="cv-center-links">' +
        '<div class="cv-active-label">' + relLabel + '</div>' +
        '<div class="cv-link-dots">' +
          allLinksA.map(function(lnk) {
            var isActive = lnk.linkedTaskId === taskIdB;
            var ld = TASK_DATA[lnk.linkedTaskId];
            return '<button class="cv-link-dot' + (isActive ? ' active' : '') + '" style="background:' + lnk.color + '" data-from="' + taskIdA + '" data-to="' + lnk.linkedTaskId + '" title="' + lnk.label + (ld ? ' \u2014 ' + ld.title : '') + '"></button>';
          }).join('') +
        '</div>' +
      '</div>' +
      buildTaskCard(taskIdB) +
    '</div>' +
    (relDesc ? '<div class="cv-rel-description">' + relDesc + '</div>' : '');
  }

  function switchComparisonCards(overlay, fromId, toId) {
    var allLinksA = taskCrossLinks[fromId] || [];
    var oldInner = overlay.querySelector('.cv-inner');
    if (!oldInner) return;

    // Create new inner
    var newInner = document.createElement('div');
    newInner.className = 'cv-inner cv-inner--entering';
    newInner.innerHTML = buildComparisonInner(fromId, toId, allLinksA);

    // Bind dot clicks on new inner
    newInner.querySelectorAll('.cv-link-dot').forEach(function(dot) {
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        switchComparisonCards(overlay, dot.dataset.from, dot.dataset.to);
      });
    });
    // Bind open task buttons on new inner
    bindOpenTaskButtons(newInner);

    // Insert new inner next to old
    var container = overlay.querySelector('.comparison-container');
    container.appendChild(newInner);

    // Fade out old, fade in new
    requestAnimationFrame(function() {
      oldInner.classList.add('cv-inner--leaving');
      newInner.classList.remove('cv-inner--entering');
      // Remove old after transition
      oldInner.addEventListener('transitionend', function handler() {
        oldInner.removeEventListener('transitionend', handler);
        oldInner.remove();
      });
      // Fallback removal
      setTimeout(function() { if (oldInner.parentNode) oldInner.remove(); }, 550);
    });
  }

  function clearRelHover() {
    viewport.classList.remove('rel-hover-dimmed');
    document.querySelectorAll('.rel-hover-highlight, .rel-hover-faded').forEach(function(el) {
      el.classList.remove('rel-hover-highlight', 'rel-hover-faded');
    });
  }

  function openComparisonView(taskIdA, taskIdB) {
    clearRelHover();
    closePanel();
    var existing = document.querySelector('.comparison-overlay');
    if (existing) existing.remove();

    var dataA = TASK_DATA[taskIdA];
    var dataB = TASK_DATA[taskIdB];
    if (!dataA || !dataB) return;

    var allLinksA = taskCrossLinks[taskIdA] || [];

    var overlay = document.createElement('div');
    overlay.className = 'comparison-overlay';
    overlay.innerHTML = '<div class="comparison-backdrop"></div>' +
      '<button class="cv-back-btn">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Back' +
      '</button>' +
      '<div class="comparison-container">' +
        '<div class="cv-inner">' +
          buildComparisonInner(taskIdA, taskIdB, allLinksA) +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('active'); });

    viewport.classList.add('cv-dimmed');

    overlay.querySelector('.cv-back-btn').addEventListener('click', function() { closeComparisonView(overlay); });
    overlay.querySelector('.comparison-backdrop').addEventListener('click', function() { closeComparisonView(overlay); });

    var onEsc = function(e) {
      if (e.key === 'Escape') { closeComparisonView(overlay); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);

    // Dot switching — crossfade in place
    overlay.querySelectorAll('.cv-link-dot').forEach(function(dot) {
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        switchComparisonCards(overlay, dot.dataset.from, dot.dataset.to);
      });
    });

    // Open task buttons — open side-by-side detail panels
    bindOpenTaskButtons(overlay);
  }

  function bindOpenTaskButtons(container) {
    container.querySelectorAll('.cv-open-task-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var tid = btn.getAttribute('data-open-task');
        if (!tid) return;
        // Collect both task IDs from the comparison view
        var cards = container.querySelectorAll('.cv-task-card[data-cv-task]');
        var taskIds = [];
        cards.forEach(function(c) { taskIds.push(c.getAttribute('data-cv-task')); });
        // Close overlay and open dual panels
        var overlay = document.querySelector('.comparison-overlay');
        if (overlay) {
          overlay.classList.remove('active');
          viewport.classList.remove('cv-dimmed');
          setTimeout(function() { overlay.remove(); openDualPanels(taskIds[0], taskIds[1]); }, 300);
        } else {
          openDualPanels(taskIds[0], taskIds[1]);
        }
      });
    });
  }

  function buildDetailHtml(taskId) {
    var data = TASK_DATA[taskId];
    if (!data) return '';
    var labels = { green: 'On Track', amber: 'Attention Needed', red: 'Blocked', blue: 'Completed' };

    var todosHtml = '';
    if (data.todos && data.todos.length > 0) {
      todosHtml = '<div class="detail-section detail-todo-section">' +
        '<h3 class="detail-section-title detail-todo-header">' +
          '<span class="detail-todo-icon">\u2611\ufe0f</span> To-Do' +
          ' <span class="detail-todo-count">' + data.todos.length + '</span>' +
        '</h3>' +
        '<div class="detail-todo-list">' +
          data.todos.map(function(todo, i) {
            var actionsHtml = '';
            if (todo.actions && todo.actions.length > 0) {
              actionsHtml = '<div class="todo-actions">' +
                '<span class="todo-actions-label">Perplexity can help:</span>' +
                '<div class="todo-actions-list">' +
                  todo.actions.map(function(action, ai) {
                    return '<button class="todo-action-btn" data-task-id="' + taskId + '" data-todo-index="' + i + '" data-action-index="' + ai + '" data-action-type="' + action.type + '">' +
                      '<span class="todo-action-icon">' + action.icon + '</span>' +
                      '<span class="todo-action-label">' + action.label + '</span>' +
                      '<span class="todo-action-arrow"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 1L7 5L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
                    '</button>';
                  }).join('') +
                '</div>' +
              '</div>';
            }
            return '<div class="detail-todo-item" data-todo-index="' + i + '" data-task-id="' + taskId + '">' +
              '<span class="detail-todo-check" data-task-id="' + taskId + '" data-todo-index="' + i + '" role="checkbox" aria-checked="false" tabindex="0">' +
                '<svg class="todo-check-empty" width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
                '<svg class="todo-check-filled" width="14" height="14" viewBox="0 0 14 14" fill="none" style="display:none"><rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.3"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</span>' +
              '<button class="detail-todo-toggle" aria-expanded="false">' +
                '<span class="detail-todo-text">' + todo.text + '</span>' +
                '<span class="detail-todo-chevron"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 5L6 7L8 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
              '</button>' +
              '<div class="detail-todo-suggestion">' +
                '<div class="detail-todo-suggestion-inner">' +
                  '<span class="detail-todo-suggestion-label">\ud83d\udca1 Suggested Action</span>' +
                  '<p class="detail-todo-suggestion-text">' + todo.suggestion + '</p>' +
                  actionsHtml +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }

    var clickupUrl = data.clickupId ? 'https://app.clickup.com/9015438153/v/li/' + data.clickupId : '#';

    return '<div class="detail-header">' +
      '<span class="detail-emoji">' + data.emoji + '</span>' +
      '<h2 class="detail-title">' + data.title + '</h2>' +
      '<span class="detail-status"><span class="status-dot status-dot--' + data.statusColor + '"></span> ' + (labels[data.statusColor] || data.status) + '</span>' +
    '</div>' +
    '<div class="detail-actions-bar">' +
      (data.clickupId ? '<a href="' + clickupUrl + '" target="_blank" rel="noopener noreferrer" class="detail-ext-btn detail-ext-btn--clickup">' +
        '<svg class="clickup-logo" width="16" height="16" viewBox="0 0 128 128" fill="none"><path d="M20.48 87.04l19.84-15.2c11.52 15.04 22.72 22.08 39.68 22.08 17.12 0 28.96-7.36 40-21.76L139.84 87.2C123.84 108.48 106.72 120 80 120c-26.56 0-44.16-11.52-59.52-32.96z" fill="#7B68EE" transform="scale(0.85) translate(8,5)"/><path d="M80 54.4l-24.64 21.12L40 56.96l40-34.56 40 34.56-15.36 18.56L80 54.4z" fill="#49CCF9" transform="scale(0.85) translate(8,5)"/></svg>' +
        ' View in ClickUp</a>' : '') +
      '<button class="detail-ext-btn detail-ext-btn--perplexity" data-task-id="' + taskId + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Continue in Perplexity' +
        '<span class="perplexity-mode-arrow"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4L5 6L7 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '</button>' +
    '</div>' +
    '<div class="detail-meta">' +
      '<div class="detail-meta-item"><span class="detail-meta-label">Assignee</span><span class="detail-meta-value">' + data.assignee + '</span></div>' +
      '<div class="detail-meta-item"><span class="detail-meta-label">Due Date</span><span class="detail-meta-value">' + data.dueDate + '</span></div>' +
    '</div>' +
    todosHtml +
    '<div class="detail-section"><h3 class="detail-section-title">Description</h3><p class="detail-text">' + data.description + '</p></div>' +
    '<div class="detail-section"><h3 class="detail-section-title">Latest Update</h3><div class="detail-update">' + data.update + '<div class="detail-update-date">' + data.updateDate + '</div></div></div>' +
    '<div class="detail-section"><h3 class="detail-section-title">Related Documents</h3><ul class="detail-links">' +
      data.documents.map(function(d) { return '<li><a href="' + d.href + '" class="detail-link" onclick="event.preventDefault()"><span class="detail-link-icon">\ud83d\udcce</span>' + d.name + '</a></li>'; }).join('') +
    '</ul></div>' +
    '<div class="detail-section"><h3 class="detail-section-title">Related Communications</h3><ul class="detail-links">' +
      data.emails.map(function(e) { return '<li><a href="' + e.href + '" class="detail-link" onclick="event.preventDefault()"><span class="detail-link-icon">\u2709\ufe0f</span>' + e.name + '</a></li>'; }).join('') +
    '</ul></div>' +
    buildRelationshipsHtml(taskId);
  }

  function bindDetailEvents(container, taskId) {
    // Bind todo toggle clicks
    container.querySelectorAll('.detail-todo-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var item = btn.closest('.detail-todo-item');
        var isExpanded = item.classList.contains('expanded');
        container.querySelectorAll('.detail-todo-item.expanded').forEach(function(el) {
          if (el !== item) el.classList.remove('expanded');
        });
        item.classList.toggle('expanded', !isExpanded);
        btn.setAttribute('aria-expanded', String(!isExpanded));
      });
    });

    // Bind action button clicks
    container.querySelectorAll('.todo-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var tId = btn.dataset.taskId;
        var todoIdx = parseInt(btn.dataset.todoIndex, 10);
        var actionIdx = parseInt(btn.dataset.actionIndex, 10);
        var todo = TASK_DATA[tId].todos[todoIdx];
        var action = todo.actions[actionIdx];
        showActionWorkspacePanel(action, todo, TASK_DATA[tId]);
      });
    });

    // Bind todo checkbox clicks
    container.querySelectorAll('.detail-todo-check').forEach(function(chk) {
      chk.addEventListener('click', function(e) {
        e.stopPropagation();
        var tId = chk.dataset.taskId;
        var idx = parseInt(chk.dataset.todoIndex, 10);
        var item = chk.closest('.detail-todo-item');
        var isChecked = item.classList.toggle('todo-checked');
        chk.setAttribute('aria-checked', String(isChecked));
        chk.querySelector('.todo-check-empty').style.display = isChecked ? 'none' : '';
        chk.querySelector('.todo-check-filled').style.display = isChecked ? '' : 'none';
        // Persist
        var key = tId + ':' + idx;
        todoCheckedState[key] = isChecked;
        saveTodoState();
      });
    });

    // Apply loaded todo checked states
    loadTodoState().then(function() {
      container.querySelectorAll('.detail-todo-check').forEach(function(chk) {
        var key = chk.dataset.taskId + ':' + chk.dataset.todoIndex;
        if (todoCheckedState[key]) {
          var item = chk.closest('.detail-todo-item');
          item.classList.add('todo-checked');
          chk.setAttribute('aria-checked', 'true');
          chk.querySelector('.todo-check-empty').style.display = 'none';
          chk.querySelector('.todo-check-filled').style.display = '';
        }
      });
    });

    // Bind Perplexity button
    container.querySelectorAll('.detail-ext-btn--perplexity').forEach(function(pplxBtn) {
      pplxBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var tid = pplxBtn.dataset.taskId;
        showPerplexityModeDropdown(pplxBtn, tid, TASK_DATA[tid]);
      });
    });

    // Bind relationship clicks
    container.querySelectorAll('.detail-rel-item--task').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var from = btn.dataset.relFrom;
        var to = btn.dataset.relTo;
        if (from && to) openComparisonView(from, to);
      });
    });

    container.querySelectorAll('.detail-show-all-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var tId = btn.dataset.taskId;
        if (tId) openAllRelatedView(tId);
      });
    });
  }

  function openDualPanels(taskIdA, taskIdB) {
    clearRelHover();
    closePanel();
    var dA = TASK_DATA[taskIdA];
    var dB = TASK_DATA[taskIdB];
    if (!dA || !dB) { if (dA) openPanel(taskIdA); else if (dB) openPanel(taskIdB); return; }

    var relDesc = getRelDescription(taskIdA, taskIdB);

    var overlay = document.createElement('div');
    overlay.className = 'comparison-overlay dual-panel-overlay';
    overlay.innerHTML = '<div class="comparison-backdrop"></div>' +
      '<button class="cv-back-btn">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Back' +
      '</button>' +
      '<div class="dual-panel-container">' +
        '<div class="dual-panel-card detail-content-clone" data-dual-task="' + taskIdA + '">' +
          buildDetailHtml(taskIdA) +
        '</div>' +
        (relDesc ? '<div class="dual-rel-bridge"><div class="dual-rel-line"></div><div class="dual-rel-label">' + relDesc + '</div><div class="dual-rel-line"></div></div>' : '') +
        '<div class="dual-panel-card detail-content-clone" data-dual-task="' + taskIdB + '">' +
          buildDetailHtml(taskIdB) +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('active'); });
    viewport.classList.add('cv-dimmed');

    // Bind all detail panel events for both cards
    overlay.querySelectorAll('.detail-content-clone').forEach(function(card) {
      var tid = card.getAttribute('data-dual-task');
      bindDetailEvents(card, tid);
    });

    overlay.querySelector('.cv-back-btn').addEventListener('click', function() { closeComparisonView(overlay); });
    overlay.querySelector('.comparison-backdrop').addEventListener('click', function() { closeComparisonView(overlay); });
    var onEsc = function(e) {
      if (e.key === 'Escape') { closeComparisonView(overlay); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);
  }

  function closeComparisonView(overlay) {
    if (!overlay) overlay = document.querySelector('.comparison-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    viewport.classList.remove('cv-dimmed');
    setTimeout(() => overlay.remove(), 300);
  }

  // ---- All Related Tasks View ----
  function openAllRelatedView(taskId) {
    clearRelHover();
    closePanel();
    var existing = document.querySelector('.comparison-overlay');
    if (existing) existing.remove();

    var rels = getAllRelationships(taskId);
    var data = TASK_DATA[taskId];
    if (!data) return;

    // Collect related task IDs with their relationship info
    var relatedTasks = [];
    rels.taskLinks.forEach(function(lnk) {
      relatedTasks.push({ taskId: lnk.taskId, label: lnk.label, color: lnk.color, type: 'cross-link' });
    });
    rels.titleLinks.forEach(function(tl) {
      var ws = WORKSTREAMS.find(function(w) { return w.id === tl.wsId; });
      if (ws) ws.tasks.forEach(function(t) {
        if (t.id !== taskId && !relatedTasks.find(function(r) { return r.taskId === t.id; })) {
          relatedTasks.push({ taskId: t.id, label: 'Shared: ' + ws.emoji + ' ' + ws.title, color: WS_COLORS[tl.wsId], type: 'ws-member' });
        }
      });
    });

    // Build structured layout: main task top, related below in grid
    var mainCard = buildTaskCard(taskId);

    var relatedCardsHtml = relatedTasks.map(function(rel) {
      var relData = TASK_DATA[rel.taskId];
      if (!relData) return '';
      return '<div class="arv-related-item">' +
        '<div class="arv-connector">' +
          '<div class="arv-connector-line" style="background:' + (rel.color || 'var(--color-border)') + '"></div>' +
          '<div class="arv-connector-label" style="border-color:' + (rel.color || 'var(--color-border)') + '">' + rel.label + '</div>' +
        '</div>' +
        buildTaskCard(rel.taskId) +
      '</div>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.className = 'comparison-overlay all-related-view';
    overlay.innerHTML = '<div class="comparison-backdrop"></div>' +
      '<button class="cv-back-btn">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Back' +
      '</button>' +
      '<div class="arv-container">' +
        '<div class="arv-main">' +
          '<div class="arv-main-label">Main Task</div>' +
          mainCard +
        '</div>' +
        (relatedTasks.length > 0 ? '<div class="arv-divider"><span>' + relatedTasks.length + ' Related Task' + (relatedTasks.length > 1 ? 's' : '') + '</span></div>' : '') +
        '<div class="arv-grid">' + relatedCardsHtml + '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('active'); });
    viewport.classList.add('cv-dimmed');

    overlay.querySelector('.cv-back-btn').addEventListener('click', function() { closeComparisonView(overlay); });
    overlay.querySelector('.comparison-backdrop').addEventListener('click', function() { closeComparisonView(overlay); });
    var onEsc = function(e) {
      if (e.key === 'Escape') { closeComparisonView(overlay); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);

    // Bind open-task buttons in all-related view
    bindOpenTaskButtons(overlay);
  }

  // ---- Collapsible Bubbles ----
  // Add collapse + reset buttons to workstream nodes
  wsEls.forEach((el, i) => {
    const btnGroup = document.createElement('div');
    btnGroup.className = 'ws-btn-group';

    // Reset layout button (left)
    const resetWsBtn = document.createElement('button');
    resetWsBtn.className = 'node-ws-reset-btn';
    resetWsBtn.title = 'Reset task layout';
    resetWsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    resetWsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      resetWorkstreamLayout(i);
    });
    btnGroup.appendChild(resetWsBtn);

    // Collapse button (right)
    const btn = document.createElement('button');
    btn.className = 'node-collapse-btn';
    btn.innerHTML = '−';
    btn.title = 'Collapse tasks';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleCollapseWorkstream(i);
    });
    btnGroup.appendChild(btn);

    el.appendChild(btnGroup);
  });

  // Reset a single workstream's task layout back to neatly stacked below the WS bubble
  function resetWorkstreamLayout(wsIndex) {
    const wsEl = wsEls[wsIndex];
    const wsX = parseFloat(wsEl.style.left);
    const wsY = parseFloat(wsEl.style.top);
    const taskRowH = 48;
    const wsToTaskGap = 52;

    // Get tasks for this workstream, sorted by original index
    const wsTasks = taskEls.filter(tn => tn.wsIndex === wsIndex);
    wsTasks.sort((a, b) => a.taskIndex - b.taskIndex);

    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // If collapsed, expand first
    if (wsEl.classList.contains('collapsed')) {
      wsEl.classList.remove('collapsed');
      const collapseBtn = wsEl.querySelector('.node-collapse-btn');
      if (collapseBtn) { collapseBtn.innerHTML = '\u2212'; collapseBtn.title = 'Collapse tasks'; }
      wsTasks.forEach(tn => tn.el.classList.remove('collapsed-hidden'));
    }

    wsTasks.forEach((tn, ti) => {
      let x = wsX;
      let y = wsY + wsToTaskGap + ti * taskRowH;
      // Clamp to viewport
      x = Math.max(140, Math.min(W - 140, x));
      y = Math.max(170, Math.min(H - 80, y));
      setNodePos(tn.el, x, y);
      originalPositions.set(tn.el, { left: tn.el.style.left, top: tn.el.style.top });
    });

    redrawLines();
    debounceSaveLayout();
    updateMiniMap();
  }

  function toggleCollapseWorkstream(wsIndex) {
    const wsEl = wsEls[wsIndex];
    const isCollapsed = wsEl.classList.contains('collapsed');
    const btn = wsEl.querySelector('.node-collapse-btn');

    if (isCollapsed) {
      // Expand — show tasks at their saved positions (don't reset)
      wsEl.classList.remove('collapsed');
      btn.innerHTML = '−';
      btn.title = 'Collapse tasks';
      taskEls.forEach(tn => {
        if (tn.wsIndex === wsIndex) {
          tn.el.classList.remove('collapsed-hidden');
          // Positions are preserved — tasks appear exactly where they were
        }
      });
    } else {
      // Collapse — hide task nodes (positions stay in DOM, just hidden)
      wsEl.classList.add('collapsed');
      btn.innerHTML = '+';
      btn.title = 'Expand tasks';
      taskEls.forEach(tn => {
        if (tn.wsIndex === wsIndex) {
          tn.el.classList.add('collapsed-hidden');
        }
      });
    }

    // Redraw lines after collapse change
    setTimeout(() => redrawLines(), 50);
    // Save the layout state so collapse/expand persists
    debounceSaveLayout();
  }

  // ---- Reset Layout Button ----
  const resetBtn = document.createElement('button');
  resetBtn.className = 'reset-layout-btn';
  resetBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Reset Layout
  `;
  resetBtn.addEventListener('click', () => {
    // Clear saved layout from server
    fetch(API_BASE + '/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: null })
    }).catch(() => {});
    // Reset pan/zoom first
    panX = 0; panY = 0; zoom = 1;
    applyTransform();
    // Expand any collapsed workstreams
    wsEls.forEach((el, i) => {
      if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        const btn = el.querySelector('.node-collapse-btn');
        if (btn) { btn.innerHTML = '\u2212'; btn.title = 'Collapse tasks'; }
        taskEls.forEach(tn => {
          if (tn.wsIndex === i) tn.el.classList.remove('collapsed-hidden');
        });
      }
    });
    // Re-run initial layout (this sets positions + draws lines)
    originalPositions.clear();
    layout();
    // Store the fresh positions
    storeOriginalPositions();
    updateMiniMap();
  });
  document.body.appendChild(resetBtn);

  // ---- Layout Persistence (save/load positions to server) ----
  let saveLayoutTimer = null;

  function saveLayoutToServer() {
    const positions = {};
    // Save central
    positions['__central__'] = { x: parseFloat(centralEl.style.left), y: parseFloat(centralEl.style.top) };
    // Save workstreams
    wsEls.forEach((el, i) => {
      const ws = WORKSTREAMS[i];
      positions['ws-' + ws.id] = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
    });
    // Save tasks
    taskEls.forEach(tn => {
      const taskId = tn.el.getAttribute('data-task');
      positions['task-' + taskId] = { x: parseFloat(tn.el.style.left), y: parseFloat(tn.el.style.top) };
    });

    fetch(API_BASE + '/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions })
    }).catch(err => console.warn('Layout save failed:', err));
  }

  function debounceSaveLayout() {
    clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(saveLayoutToServer, 800);
  }

  async function loadLayoutFromServer() {
    try {
      const resp = await fetch(API_BASE + '/api/layout');
      const data = await resp.json();
      if (!data.positions) return false;

      const p = data.positions;
      let applied = false;

      // Restore central
      if (p['__central__']) {
        setNodePos(centralEl, p['__central__'].x, p['__central__'].y);
        applied = true;
      }
      // Restore workstreams
      wsEls.forEach((el, i) => {
        const key = 'ws-' + WORKSTREAMS[i].id;
        if (p[key]) {
          setNodePos(el, p[key].x, p[key].y);
          applied = true;
        }
      });
      // Restore tasks
      taskEls.forEach(tn => {
        const key = 'task-' + tn.el.getAttribute('data-task');
        if (p[key]) {
          setNodePos(tn.el, p[key].x, p[key].y);
          applied = true;
        }
      });

      if (applied) {
        storeOriginalPositions();
        redrawLines();
      }
      return applied;
    } catch (err) {
      return false;
    }
  }

  // Hook into mouseup to save positions after drag
  const origMouseUp = document.onmouseup;
  document.addEventListener('mouseup', (e) => {
    if (draggedNode) {
      // Small delay to let the position settle
      setTimeout(debounceSaveLayout, 100);
    }
  });


  // ================================================================
  // STATIC SYNC INDICATOR (data is hardcoded, no real sync needed)
  // ================================================================


  // ================================================================
  // ACTIVITY FEED
  // ================================================================
  (function initActivityFeed() {
    var feedPanel = document.getElementById('activityFeed');
    var feedToggle = document.getElementById('activityFeedToggle');
    var feedClose = document.getElementById('activityFeedClose');
    var feedBackdrop = document.getElementById('activityFeedBackdrop');
    var feedList = document.getElementById('activityFeedList');
    var feedBadge = document.getElementById('activityBadge');
    if (!feedPanel || !feedToggle) return;

    // Mock activity data (will be replaced by real connector data)
    var ACTIVITIES = [
      { type: 'email', icon: '\u2709\ufe0f', text: '<strong>Anna S\u00f8rensen</strong> replied to Rate Card Review thread', task: 'Rate Card Finalization', taskId: 'neg-1', time: '4 min ago' },
      { type: 'clickup', icon: '\u2705', text: '<strong>Lars Pedersen</strong> updated API Integration status to <strong>In Progress</strong>', task: 'API Integration', taskId: 'tech-1', time: '12 min ago' },
      { type: 'calendar', icon: '\ud83d\udcc5', text: 'SteerCo meeting scheduled for <strong>Thursday 10:00</strong>', task: 'SteerCo Brief', taskId: 'com-1', time: '25 min ago' },
      { type: 'chat', icon: '\ud83d\udcac', text: '<strong>Kristina Rudoman</strong> mentioned you in <strong>Denmark</strong> space', task: null, taskId: null, time: '38 min ago' },
      { type: 'drive', icon: '\ud83d\udcc4', text: '<strong>Erik Lindqvist</strong> edited SLA Framework v2.1', task: 'SLA Review', taskId: 'neg-2', time: '1h ago' },
      { type: 'email', icon: '\u2709\ufe0f', text: 'New email from <strong>Client Legal</strong> re: Contract Amendment', task: 'Contract Amendment', taskId: 'leg-2', time: '1h ago' },
      { type: 'clickup', icon: '\ud83d\udcdd', text: '<strong>Mette Hansen</strong> added a comment on Vendor Onboarding', task: 'Vendor Onboarding Pack', taskId: 'neg-3', time: '2h ago' },
      { type: 'clickup', icon: '\u2705', text: '<strong>Astrid Olsen</strong> completed encoding fix checklist item', task: 'Archive Migration', taskId: 'doc-3', time: '2h ago' },
      { type: 'calendar', icon: '\ud83d\udcc5', text: 'SLA Client Call moved to <strong>Wednesday 14:00</strong>', task: 'SLA Review', taskId: 'neg-2', time: '3h ago' },
      { type: 'drive', icon: '\ud83d\udcc4', text: '<strong>Katrine M\u00f8ller</strong> shared GDPR Legal Basis Draft', task: 'GDPR Compliance Audit', taskId: 'leg-1', time: '4h ago' },
    ];

    function buildActivityList() {
      feedList.innerHTML = '';
      ACTIVITIES.forEach(function(item, i) {
        var el = document.createElement('div');
        el.className = 'activity-item';
        el.style.animationDelay = (0.08 * i) + 's';

        var taskHtml = item.task ? '<span class="activity-item-task">' + item.task + '</span><span class="activity-item-dot"></span>' : '';

        el.innerHTML = '<div class="activity-item-icon activity-item-icon--' + item.type + '">' + item.icon + '</div>' +
          '<div class="activity-item-body">' +
            '<p class="activity-item-text">' + item.text + '</p>' +
            '<div class="activity-item-meta">' + taskHtml + '<span class="activity-item-time">' + item.time + '</span></div>' +
          '</div>';

        // Click to navigate to task + dismiss notification badge
        if (item.taskId && typeof window.openPanel === 'function') {
          el.addEventListener('click', function() {
            closeFeed();
            // Dismiss the notification badge for this task
            if (typeof dismissNotifBadge === 'function') {
              dismissNotifBadge(item.taskId);
            }
            setTimeout(function() { window.openPanel(item.taskId); }, 400);
          });
        }

        feedList.appendChild(el);
      });
    }

    function openFeed() {
      buildActivityList();
      feedPanel.classList.add('open');
      feedBackdrop.classList.add('visible');
      feedBadge.classList.add('hidden');
    }

    function closeFeed() {
      feedPanel.classList.remove('open');
      feedBackdrop.classList.remove('visible');
      // Badge reappears after a brief delay (simulates new activity arriving)
      setTimeout(function() {
        if (!feedPanel.classList.contains('open')) {
          feedBadge.classList.remove('hidden');
        }
      }, 5000);
    }

    feedToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      if (feedPanel.classList.contains('open')) closeFeed();
      else openFeed();
    });

    feedClose.addEventListener('click', closeFeed);
    feedBackdrop.addEventListener('click', closeFeed);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && feedPanel.classList.contains('open')) {
        closeFeed();
      }
    });
  })();


  // ================================================================
  // NOTIFICATION BADGES ON TASK BUBBLES
  // ================================================================
  // Notification data — shared between badges, panel, and activity feed
  var NOTIF_DATA = {
      'neg-1': {
        items: [
          { type: 'email', icon: '\u2709\ufe0f', label: '1 unread email from Anna S\u00f8rensen', detail: 'Re: Rate Card Review', href: 'https://mail.google.com/mail/u/0/#search/from%3AAnna+S%C3%B8rensen+Rate+Card+Review' }
        ]
      },
      'tech-1': {
        items: [
          { type: 'comment', icon: '\ud83d\udcac', label: '2 new comments on ClickUp', detail: 'API Integration task', href: 'https://app.clickup.com/9015438153/v/li/api-integration' }
        ]
      },
      'neg-2': {
        items: [
          { type: 'email', icon: '\u2709\ufe0f', label: '1 unread email from Erik Lindqvist', detail: 'Re: SLA Framework v2.1', href: 'https://mail.google.com/mail/u/0/#search/from%3AErik+Lindqvist+SLA+Framework' }
        ]
      },
      'leg-2': {
        items: [
          { type: 'email', icon: '\u2709\ufe0f', label: '1 unread email from Client Legal', detail: 'Re: Contract Amendment', href: 'https://mail.google.com/mail/u/0/#search/Contract+Amendment' }
        ]
      },
      'neg-3': {
        items: [
          { type: 'comment', icon: '\ud83d\udcac', label: '1 new comment from Mette Hansen', detail: 'Vendor Onboarding Pack', href: 'https://app.clickup.com/9015438153/v/li/vendor-onboarding-pack' }
        ]
      },
      'doc-3': {
        items: [
          { type: 'comment', icon: '\ud83d\udcac', label: '1 new comment from Astrid Olsen', detail: 'Archive Migration checklist', href: 'https://app.clickup.com/9015438153/v/li/archive-migration' }
        ]
      }
    };

  // Helper to dismiss a notification badge for a task
  function dismissNotifBadge(taskId) {
    var badge = document.querySelector('[data-notif-task="' + taskId + '"]');
    if (badge) {
      badge.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      badge.style.opacity = '0';
      badge.style.transform = 'scale(0)';
      setTimeout(function() { badge.remove(); }, 500);
    }
    // Remove pulsating glow from the task node
    var taskNode = document.querySelector('.node--task[data-task="' + taskId + '"]');
    if (taskNode) taskNode.classList.remove('has-notifications');
    // Also update the bell badge count
    var bellBadge = document.getElementById('activityBadge');
    if (bellBadge && !bellBadge.classList.contains('hidden')) {
      var current = parseInt(bellBadge.textContent) || 0;
      var itemCount = NOTIF_DATA[taskId] ? NOTIF_DATA[taskId].items.length : 1;
      var newCount = Math.max(0, current - itemCount);
      if (newCount <= 0) {
        bellBadge.classList.add('hidden');
      } else {
        bellBadge.textContent = newCount;
      }
    }
    // Mark as read in NOTIF_DATA
    if (NOTIF_DATA[taskId]) {
      NOTIF_DATA[taskId].read = true;
    }
  }

  // Build notification section HTML for the task detail panel
  function buildNotifSectionHtml(taskId) {
    var data = NOTIF_DATA[taskId];
    if (!data || data.items.length === 0 || data.read) return '';

    var items = data.items.map(function(item, i) {
      return '<div class="panel-notif-item" data-notif-idx="' + i + '" data-notif-task="' + taskId + '" data-notif-href="' + (item.href || '') + '">' +
        '<span class="panel-notif-icon">' + item.icon + '</span>' +
        '<div class="panel-notif-body">' +
          '<span class="panel-notif-label">' + item.label + '</span>' +
          '<span class="panel-notif-detail">' + item.detail + '</span>' +
        '</div>' +
        '<span class="panel-notif-action">View</span>' +
      '</div>';
    }).join('');

    return '<div class="detail-section detail-notif-section" data-notif-section="' + taskId + '">' +
      '<h3 class="detail-section-title detail-notif-title">' +
        '<span class="detail-notif-dot"></span>' +
        'Notifications' +
        '<span class="detail-notif-count">' + data.items.length + '</span>' +
      '</h3>' +
      '<div class="panel-notif-list">' + items + '</div>' +
    '</div>';
  }

  (function initNotificationBadges() {
    // Create tooltip element
    var tooltip = document.createElement('div');
    tooltip.className = 'notif-tooltip';
    tooltip.innerHTML = '<div class="notif-tooltip-title"></div><div class="notif-tooltip-items"></div><div class="notif-tooltip-hint">Click to open</div>';
    document.body.appendChild(tooltip);
    var tooltipTitle = tooltip.querySelector('.notif-tooltip-title');
    var tooltipItems = tooltip.querySelector('.notif-tooltip-items');
    var tooltipTimeout = null;

    function showTooltip(badge, data) {
      clearTimeout(tooltipTimeout);
      var total = data.items.length;
      var hasEmail = data.items.some(function(i) { return i.type === 'email'; });
      var hasComment = data.items.some(function(i) { return i.type === 'comment'; });
      
      if (hasEmail && hasComment) tooltipTitle.textContent = 'Unread notifications';
      else if (hasEmail) tooltipTitle.textContent = total + ' unread email' + (total > 1 ? 's' : '');
      else tooltipTitle.textContent = total + ' new comment' + (total > 1 ? 's' : '');

      tooltipItems.innerHTML = '';
      data.items.forEach(function(item) {
        var el = document.createElement('div');
        el.className = 'notif-tooltip-item';
        el.innerHTML = '<span class="notif-tooltip-item-icon">' + item.icon + '</span>' +
          '<span>' + item.label + '</span>';
        tooltipItems.appendChild(el);
      });

      var rect = badge.getBoundingClientRect();
      tooltip.style.left = Math.max(8, rect.left - 20) + 'px';
      tooltip.style.top = (rect.bottom + 8) + 'px';
      tooltip.classList.add('visible');
    }

    function hideTooltip() {
      tooltipTimeout = setTimeout(function() {
        tooltip.classList.remove('visible');
      }, 120);
    }

    var taskNodes = document.querySelectorAll('.node--task');
    var badgeIndex = 0;

    taskNodes.forEach(function(node) {
      var taskId = node.getAttribute('data-task');
      var data = NOTIF_DATA[taskId];
      if (!data || data.items.length === 0) return;

      var total = data.items.reduce(function(sum, item) {
        var count = parseInt(item.label) || 1;
        return sum + count;
      }, 0);
      // Use the number from the first item's label
      var firstNum = data.items[0].label.match(/^(\d+)/);
      total = firstNum ? parseInt(firstNum[1]) : data.items.length;
      if (data.items.length > 1) {
        total = data.items.reduce(function(sum, item) {
          var m = item.label.match(/^(\d+)/);
          return sum + (m ? parseInt(m[1]) : 1);
        }, 0);
      }

      var badgeType = data.items[0].type === 'email' ? 'email' : 'comment';
      var badge = document.createElement('span');
      badge.className = 'node-notif-badge node-notif-badge--' + badgeType + ' has-new';
      badge.textContent = total;
      badge.style.setProperty('--badge-delay', (1.5 + badgeIndex * 0.15) + 's');
      badge.setAttribute('data-notif-task', taskId);

      // Remove native title — we use a custom tooltip
      badge.removeAttribute('title');

      // Hover: show rich tooltip
      badge.addEventListener('mouseenter', function() { showTooltip(badge, data); });
      badge.addEventListener('mouseleave', function() { hideTooltip(); });

      // Click: open the task detail panel (not external link)
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof window.openPanel === 'function') {
          window.openPanel(taskId, { scrollToNotif: true });
        }
      });

      // Mark the task node as having notifications (for pulsating glow)
      node.classList.add('has-notifications');

      // Place badge as FIRST child in title-link-dots (far left, before relationship dots)
      var dotsContainer = node.querySelector('.title-link-dots');
      if (!dotsContainer) {
        dotsContainer = document.createElement('div');
        dotsContainer.className = 'title-link-dots';
        node.appendChild(dotsContainer);
      }
      // Insert as first child so it appears on the far left
      if (dotsContainer.firstChild) {
        dotsContainer.insertBefore(badge, dotsContainer.firstChild);
      } else {
        dotsContainer.appendChild(badge);
      }
      badgeIndex++;
    });
  })();


  // ---- Init ----
  async function init() {
    layout();
    setTimeout(async () => {
      storeOriginalPositions();
      // Try loading saved layout from server
      const loaded = await loadLayoutFromServer();
      updateCompletion();
      document.querySelectorAll('.node').forEach(n => n.classList.add('anim-done'));
      updateBreadcrumb();
      updateMiniMap();
      if (loaded) redrawLines();
    }, 1040);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(init);
  }
  window.addEventListener('load', init);
  requestAnimationFrame(init);
})();
