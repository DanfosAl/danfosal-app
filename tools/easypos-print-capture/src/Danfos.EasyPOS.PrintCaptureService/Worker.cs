using System.Diagnostics.Eventing.Reader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;

public class Worker : BackgroundService
{
  private readonly IConfiguration _config;
  private EventLogWatcher? _watcher;

  public Worker(IConfiguration config) => _config = config;

  protected override Task ExecuteAsync(CancellationToken stoppingToken)
  {
    var printerName = _config["Capture:PrinterName"] ?? "PS80_REAL";

    var query = new EventLogQuery(
      "Microsoft-Windows-PrintService/Operational",
      PathType.LogName,
      "*[System[(EventID=307)]]"
    );

    _watcher = new EventLogWatcher(query);
    _watcher.EventRecordWritten += (s, e) =>
    {
      if (e.EventRecord == null) return;

      try
      {
        var xml = e.EventRecord.ToXml();

        if (!xml.Contains(printerName, StringComparison.OrdinalIgnoreCase))
          return;

        var jobId = Spool.SpoolJobLocator.TryExtractJobId(xml);
        if (jobId == null) return;

        _ = Task.Run(async () =>
        {
          await Spool.SpoolJobLocator.ProcessJobAsync(_config, jobId.Value);
        });
      }
      catch
      {
        // keep service resilient; log later if desired
      }
    };

    _watcher.Enabled = true;
    return Task.CompletedTask;
  }

  public override void Dispose()
  {
    _watcher?.Dispose();
    base.Dispose();
  }
}
