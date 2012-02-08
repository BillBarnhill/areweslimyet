
"use strict";

jQuery.new = function(e, attrs, css) {
  var ret = jQuery(document.createElement(e));
  if (attrs) ret.attr(attrs);
  if (css) ret.css(css);
  return ret;
};

var gSeries = {
  'MaxMemory' : "Peak memory usage [explicit]",
  'MaxMemoryResident' : "Peak memory usage [resident]",
  'StartMemory' : "Fresh start memory [explicit]",
  'StartMemoryResident' : "Fresh start memory [resident]",
  'EndMemory' : "After test memory [explicit]",
  'EndMemoryResident' : "After test memory [resident]"
};

var gZoomedGraph;
var gGraphData;
var gMouseoverItem;

function formatBytes(raw) {
  function prettyFloat(aFloat) {
    var ret = Math.round(aFloat * 100).toString();
    if (ret == "0") return ret;
    if (ret.length < 3)
      ret = (ret.length < 2 ? "00" : "0") + ret;
    
    var clen = (ret.length - 2) % 3;
    ret = ret.slice(0, clen) + ret.slice(clen, -2).replace(/[0-9]{3}/g, ',$&') + '.' + ret.slice(-2);
    return clen ? ret : ret.slice(1);
  }
  if (raw / 1024 < 50) {
    return prettyFloat(raw) + "B";
  } else if (raw / Math.pow(1024, 2) < 5) {
    return prettyFloat(raw / 1024) + "KiB";
  } else if (raw / Math.pow(1024, 3) < 5) {
    return prettyFloat(raw / Math.pow(1024, 2)) + "MiB";
  } else {
    return prettyFloat(raw / Math.pow(1024, 3)) + "GiB";
  }
}

//
// Tooltip stuff
//

function tooltipHover(tooltip, pageX, pageY, nofade) {
  if (tooltip.is('.zoomed'))
    return;
  
  if (pageX === undefined || pageY === undefined)
  {
    tooltip.stop().fadeTo(200, 0, function () { $(this).hide(); });
    return;
  }
  
  var h = tooltip.outerHeight();
  var w = tooltip.outerWidth();
  var pad = 5;
  // Lower-right of cursor
  var top = pageY + pad;
  var left = pageX + pad;
  // Move above cursor if too far down
  if (window.innerHeight + document.body.scrollTop < top + h + 30)
    top = pageY - h - pad;
  // Move left of cursor if too far right
  if (window.innerWidth + document.body.scrollLeft < left + w + 30)
    left = pageX - w - pad;
  
  tooltip.css({
    top: top,
    left: left
  });
  
  // Show tooltip
  if (!nofade)
    tooltip.stop().fadeTo(200, 1);
}

function tooltipZoom(tooltip) {
  var w = tooltip.parent().width();
  var h = tooltip.parent().height();
    
  tooltip.stop().addClass('zoomed').animate({
    width: '110%',
    height: '100%',
    left: '-5%',
    top: '-5%',
    opacity: 1
  }, 500);
}

function tooltipUnZoom(tooltip) {
  if (tooltip.is('.zoomed') && !tooltip.is(':animated'))
  {
    tooltip.animate({
        width: '50%',
        height: '50%',
        top: '25%',
        left: '25%',
        opacity: '0'
      }, 250, function() {
        gMouseoverItem = null;
        tooltip.removeAttr('style').hide().removeClass('zoomed');
    });
  }
}

function PlotClick(plot, item) {
  if (item) {
    var tooltip = plot.find('.tooltip');
    tooltipZoom(tooltip);
    // Attach everything to an abs div so it can fade out without
    // affecting flow
    var fadeOut = $.new('div', null, { position: 'absolute' })
                    .append(tooltip.children())
                    .appendTo(tooltip)
                    .fadeTo(500, 0, function () {
                      $(this).remove();
                    });
    var loading = $.new('h2', null, {
      display: 'none',
      'text-align': 'center',
      'margin-top': '200px'
    }).text('Loading datapoint...')
      .appendTo(tooltip)
      .fadeIn();
    // Load
    $.ajax({
      url: './data/' + gGraphData['build_info'][item.dataIndex]['revision'] + '.json',
      success: function (data) {
      },
      error: function(xhr, status, error) {
        loading.text("An error occured while loading the datapoint");
        tooltip.append($.new('p', null, { color: '#F55' }).text(status + ': ' + error));
      },
      dataType: 'json'
    });
  }
}

function PlotHover(plot, item) {
  var tooltip = plot.find('.tooltip');
  if (item !== plot.data('hoveredItem') && !tooltip.is('.zoomed')) {
    if (item) {
      var seriesData = plot.data('seriesData');
      // Tooltip Content
      var t = tooltip.empty();
      $.new('h2').text("Nightly").appendTo(t); // FIXME
      $.new('p').text(seriesData[item.seriesIndex]['label']).appendTo(t);
      $.new('p').text(new Date(item.datapoint[0] * 1000).toDateString()).appendTo(t);
      $.new('p').text(formatBytes(item.datapoint[1])).appendTo(t);
      $.new('p').text(gGraphData['build_info'][item.dataIndex]['revision'].slice(0,12)).appendTo(t);
      
      // Tooltips move relative to the plot, not the page
      var offset = plot.offset();
      tooltipHover(tooltip, item.pageX - offset.left, item.pageY - offset.top, plot.data('hoveredItem') ? true : false);
    }
    else {
      tooltipHover(tooltip);
    }
    plot.data('hoveredItem', item);
  }
}

//
// Append a graph to #graphs
// - axis -> { 'AxisName' : 'Nicename', ... }
//
function addGraph(axis) {
  
  var seriesData = [];
  
  for (var x in axis) {
    seriesData.push({ label: axis[x], data: gGraphData['series'][x] });
  }
  
  var plotbox = $.new('div').addClass('graph').prependTo($('#graphs'));
  var plot = $.plot(plotbox,
    // Data
    seriesData,
    // Options
    {
      series: {
        lines: { show: true },
        points: { show: true }
      },
      grid: {
        color: "#FFF",
        hoverable: true,
        clickable: true
      },
      xaxis: {
        tickFormatter: function(val, axis) {
          return new Date(val * 1000).toDateString();
        }
      },
      yaxis: {
        tickFormatter: function(val, axis) {
          return formatBytes(val);
        }
      },
      legend: {
        backgroundColor: "#000",
        margin: 10,
        backgroundOpacity: 0.4
      }
    }
  );
  
  plotbox.data({ 'plot_obj' : plot, 'seriesData' : seriesData});
  //
  // Graph Tooltip
  //

  plotbox.append($.new('div', { 'class' : 'tooltip' }, { 'display' : 'none' }));
  plotbox.bind("plotclick", function(event, pos, item) { PlotClick(plotbox, item); });
  plotbox.bind("plothover", function(event, pos, item) { PlotHover(plotbox, item); });
}

$(function () {
  // Load graph data
  $.ajax({
    url: './data/series.json',
    success: function (data) {
      gGraphData = data;
      $('#graphs h3').remove();
      // Temporary hack to visualize per-GC data
      addGraph({
        'MaxMemory_immediate': 'All tabs open, immediately after',
        'MaxMemory_pre': 'All tabs open, 30s later',
        'MaxMemory_hundredgc': 'All tabs open, 100 GC/CC cycles',
      });
      var gc_names = [ '_immediate', '_pre', '_hundredgc' ];
      for (var n in gc_names) {
        var x = gc_names[n];
        $.new('h3').text(x).appendTo($('#graphs'));
        var newseries = {};
        for (var k in gSeries)
          newseries[k + x] = gSeries[k];
        addGraph(newseries);
      }
    },
    error: function(xhr, status, error) {
      $('#graphs h3').text("An error occured while loading the graph data");
      $('#graphs').append($.new('p', null, { color: '#F55' }).text(status + ': ' + error));
    },
    dataType: 'json'
  });
  
  // Close zoomed tooltips upon clicking outside of them
  $('body').bind('click', function(e) {
    if (!$(e.target).is('.tooltip') && !$(e.target).parents('.tooltip').length)
      $('.tooltip.zoomed').each(function(ind,ele) {
        tooltipUnZoom($(ele));
      });
  });
});
