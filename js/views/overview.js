/*
 * js/views/overview.js - Overview view
 * ---------------------------------------------------------------------------
 * The dashboard: fairness metric tiles and the per-child table
 * (paid so far, times assigned, weeks in group, difference from
 * target). The first row is "who comes next".
 *
 * Registered on the shared namespace as FairShare.Views.overview.
 */

(function () {
  'use strict';

  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const Fairness = window.FairShare.Fairness;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** One metric tile of the overview row. */
  function metricTile(label, value) {
    return (
      '<div class="col"><div class="card h-100 shadow-sm">' +
      '<div class="card-body py-2">' +
      '<div class="fw-semibold small text-body-secondary text-uppercase">' +
      escapeHtml(label) +
      '</div>' +
      '<div class="h5 mb-0">' + value + '</div>' +
      '</div></div></div>'
    );
  }

  Views.overview = {
    /**
     * Render the overview.
     *
     * @param {object} app - the App instance (i18n, model, navigation)
     */
    render(app) {
      const i18n = app.i18n;
      const stats = Fairness.buildOverview(
        app.model.toJson(),
        Util.todayIso()
      );
      const activeCount = stats.perKid.length;

      let html = '';

      /* ---- fairness metric tiles ---- */
      html +=
        '<div class="g-2 mb-3 row row-cols-2 row-cols-md-4">' +
        metricTile(i18n.t('overview.activeKidsLabel'), String(activeCount)) +
        metricTile(
          i18n.t('overview.rate'),
          i18n.formatMoney(stats.groupRatePerWeek * 52 / 12) +
            ' / ' +
            i18n.monthWord()
        ) +
        metricTile(
          i18n.t('overview.costSpread'),
          i18n.formatMoney(stats.costSpread) +
            (0 < stats.costSpreadPct
              ? ' (' + Math.round(stats.costSpreadPct * 100) + '%)'
              : '')
        ) +
        metricTile(
          i18n.t('overview.frequencySpread'),
          String(stats.frequencySpread)
        ) +
        '</div>';

      /* ---- per-child fairness table (or the empty state) ---- */
      if (0 === activeCount) {
        html +=
          '<div class="card mb-3 shadow-sm"><div class="card-body">' +
          '<p class="mb-3 text-body-secondary">' +
          escapeHtml(i18n.t('overview.emptyKids')) +
          '</p>' +
          '<button class="btn btn-primary" id="btn-plan-from-overview" type="button">' +
          escapeHtml(i18n.t('overview.planEvent')) +
          '</button></div></div>';
      } else {
        html +=
          '<div class="card mb-3 shadow-sm">' +
          '<div class="table-responsive">' +
          '<table class="align-middle mb-0 table table-hover">' +
          '<thead><tr>' +
          '<th>' + escapeHtml(i18n.t('overview.child')) + '</th>' +
          '<th class="text-end">' +
          escapeHtml(i18n.t('overview.total')) +
          '</th>' +
          '<th class="text-end">' +
          escapeHtml(i18n.t('overview.times')) +
          '</th>' +
          '<th class="text-end">' +
          escapeHtml(i18n.t('overview.weeks')) +
          '</th>' +
          '<th class="text-end">' +
          escapeHtml(i18n.t('overview.difference')) +
          '</th></tr></thead><tbody>';

        stats.perKid.forEach(function (kid, index) {
          const differenceClass =
            -0.005 > kid.difference
              ? 'diff-under'
              : 0.005 < kid.difference
                ? 'diff-over'
                : 'diff-zero';
          const nextBadge =
            0 === index
              ? ' <span class="badge ms-1 text-bg-primary">' +
                escapeHtml(i18n.t('overview.nextUp')) +
                '</span>'
              : '';

          html +=
            '<tr>' +
            '<td>' + escapeHtml(kid.name) + nextBadge + '</td>' +
            '<td class="text-end">' +
            i18n.formatMoney(kid.totalSpent) +
            '</td>' +
            '<td class="text-end">' + kid.timesAssigned + '</td>' +
            '<td class="text-end">' +
            i18n.formatWeeks(kid.weeksInKita) +
            '</td>' +
            '<td class="' + differenceClass + ' fw-semibold text-end">' +
            i18n.formatSignedMoney(kid.difference) +
            '</td></tr>';
        });

        html +=
          '</tbody></table></div>' +
          '<div class="card-body py-2">' +
          '<small class="text-body-secondary">' +
          escapeHtml(i18n.t('overview.legend')) +
          '</small></div></div>';
      }

      /* ---- quick action ---- */
      html +=
        '<div class="card shadow-sm"><div class="card-body">' +
        '<button class="btn btn-primary" id="btn-plan-from-overview" type="button">' +
        escapeHtml(i18n.t('overview.planEvent')) +
        '</button></div></div>';

      const view = document.getElementById('view');
      view.innerHTML = html;

      // The quick-action button appears in both the empty state and the
      // bottom card; wire every occurrence.
      view
        .querySelectorAll('#btn-plan-from-overview')
        .forEach(function (button) {
          button.addEventListener('click', function () {
            app.switchView('plan');
          });
        });
    },
  };
})();
