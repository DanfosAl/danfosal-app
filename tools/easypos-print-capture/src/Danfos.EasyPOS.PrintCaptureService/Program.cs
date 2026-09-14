using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

IHost host = Host.CreateDefaultBuilder(args)
  .UseWindowsService()
  .ConfigureServices((context, services) =>
  {
    services.AddHostedService<Worker>();
  })
  .Build();

await host.RunAsync();
