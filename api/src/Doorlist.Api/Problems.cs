using Microsoft.AspNetCore.Mvc;

namespace Doorlist.Api;

public static class Problems
{
    public static ProblemDetails Conflict(string title) =>
        new() { Title = title, Status = StatusCodes.Status409Conflict };
}
