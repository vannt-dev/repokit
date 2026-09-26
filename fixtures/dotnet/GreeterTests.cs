using Xunit;

namespace Fixture.Tests;

public class GreeterTests
{
    [Fact]
    public void Greets()
    {
        Assert.Equal("hello, world", $"hello, {"world"}");
    }
}
